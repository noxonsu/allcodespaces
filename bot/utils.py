import datetime

from services import MainService
from parsers import CampaignChannelParserIn

from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Update)
from telegram.ext import ContextTypes
from logger import logger
import httpx


async def _public_message(bot, campaign_channels: list[CampaignChannelParserIn]):
    posts_data = []
    kwargs = {}

    def _parse_campaign_button(campaign_channel: CampaignChannelParserIn):
        keyboard = [
            [
                InlineKeyboardButton(
                   campaign_channel.campaign.message.button.title,
                url=campaign_channel.analysis_link),
            ]
        ]
        return InlineKeyboardMarkup(keyboard)

    for campaign_channel in campaign_channels:
        if not campaign_channel:
            continue
        post = None
        if campaign_channel.has_message_button:
            kwargs['reply_markup'] = _parse_campaign_button(campaign_channel)

        if campaign_channel.has_message_video:
            post = await bot.send_video(
                video=open(campaign_channel.campaign.message.video_local_path, 'rb'),
                chat_id=campaign_channel.channel.tg_id,
                parse_mode='HTML',
                caption=campaign_channel.message_as_text, **kwargs)
        elif campaign_channel.has_message_image:
            post = await bot.send_photo(
                photo=open(campaign_channel.campaign.message.image_local_path, 'rb'),
                chat_id=campaign_channel.channel.tg_id,
                parse_mode='HTML',
                caption=campaign_channel.campaign.message.as_text, **kwargs)
        if post:
            posts_data.append(
                {
                    'id': campaign_channel.campaign.message.id,
                    'channel_post_id': post['message_id'],
                    'message_publish_date': str(datetime.datetime.now()),
                    "is_message_published": True,
                    "publish_status":'published',
                    "campaign_channel_id": str(campaign_channel.id),
                }
            )
    return posts_data


async def channel_handle_kicked(update: Update, context):
    chat_name = update.my_chat_member.chat.title
    print(f"Bot kicked from {chat_name}")
    service = MainService()
    service.bot_kicked(chat_id=update.my_chat_member.chat.id)


async def publish_channel_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    update_dict = update.to_dict()
    imag = 'https://cdn.vectorstock.com/i/1000x1000/64/33/this-is-just-a-test-funny-quote-vector-46416433.webp'
    chat_id = update_dict["my_chat_member"]["chat"]["id"]
    to_publics = httpx.get(url=f'http://web-app:8000/api/campaign-channel/?channel__tag_id={chat_id}&is_message_published=false')
    to_publics = to_publics.json()
    messages_posts_ids = {}
    for to_public in to_publics:
        try:
            post= await context.bot.send_photo(
                photo=imag,
                chat_id=chat_id,
                parse_mode='HTML',
                caption=to_public['message']['as_text'])
            messages_posts_ids[str(to_public['id'])] = post['message_id']
        except Exception as e:
            print(e)

    for public_id in messages_posts_ids:
        data = {
            'channel_post_id': messages_posts_ids[public_id],
            'message_publish_date': str(datetime.datetime.now()),
            "is_message_published": True,
        }
        response = httpx.patch(url=f'http://web-app:8000/api/campaign-channel/{public_id}/', json=data)


async def channel_handle_add(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_name = update.my_chat_member.chat.title
    chat_id = update.my_chat_member.chat.id
    bot_name = update.my_chat_member.new_chat_member.user.first_name
    members_count = await update.effective_chat.get_member_count()
    photo_file = ''
    chat = await context.bot.get_chat(chat_id)
    if chat.photo:
        photo_file = (await context.bot.getFile(chat.photo.big_file_id)).file_path
    data = dict(name=chat_name, tg_id=chat_id, is_bot_installed=True, meta=update.to_dict(), avatar=photo_file, invitation_link=chat.invite_link)
    logger.info(f"BOT ADDED TO CHANNEL: {data=}")
    httpx.post(url='http://web-app:8000/api/channel/', json=data)


async def channel_bot_status_handle(update, context):
    update_dict = update.to_dict()
    if update_dict["my_chat_member"]["new_chat_member"]["status"] == "administrator":
        await channel_handle_add(update, context)
        await publish_channel_message(update, context)
    elif update_dict["my_chat_member"]["new_chat_member"]["status"] == "kicked":
        await channel_handle_kicked(update, context)
