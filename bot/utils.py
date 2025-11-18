from telegram.error import TimedOut

from helpers import _publish_messages_logic
from services import MainService
from parsers import CampaignChannelParserIn

from telegram import Update
from telegram.ext import ContextTypes
from logger import logger


async def _public_message(bot, campaign_channels: list[CampaignChannelParserIn]):
    posts_data = []
    kwargs = {}
    timedout_messages = []

    for campaign_channel in campaign_channels:
        try:
            if not campaign_channel:
                continue
            await _publish_messages_logic(bot, campaign_channel, kwargs, posts_data)
        except TimedOut:
            logger.error(f"PUBLISH ERROR: Timeout for {campaign_channel}")
            timedout_messages.append(campaign_channel)
        except Exception as e:
            logger.error(f"Exception: {e}")

    return posts_data


async def channel_handle_kicked(update: Update, context):
    chat_name = update.my_chat_member.chat.title
    print(f"Bot kicked from {chat_name}")
    service = MainService()
    service.bot_kicked(chat_id=update.my_chat_member.chat.id)


async def publish_channel_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    update_dict = update.to_dict()
    chat_id = update_dict["my_chat_member"]["chat"]["id"]
    service: MainService = MainService(parser=CampaignChannelParserIn)
    service.unpublished_campaign_channel_by_words(channel_tg_id=chat_id, words="-----")
    posted_data = await _public_message(context.bot, service.parse())
    if service.has_data():
        for public_message in posted_data:
            logger.info(f"SENDING {posted_data}")
            service.update_public_messages_info(
                public_message["campaign_channel_id"], public_message
            )


async def channel_handle_add(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_name = update.my_chat_member.chat.title
    chat_id = update.my_chat_member.chat.id
    photo_file = ""
    chat = await context.bot.get_chat(chat_id)
    if chat.photo:
        photo_file = (await context.bot.getFile(chat.photo.big_file_id)).file_path

    # CHANGE: Получаем список администраторов канала
    # WHY: Нужно определить владельца канала для привязки к ChannelAdmin
    # REF: issue #55
    admins_list = []
    try:
        admins = await context.bot.get_chat_administrators(chat_id)
        for admin in admins:
            admins_list.append({
                "user_id": admin.user.id,
                "username": admin.user.username,
                "first_name": admin.user.first_name,
                "last_name": admin.user.last_name,
                "status": admin.status,  # creator, administrator
            })
        logger.info(f"Found {len(admins_list)} admins for channel {chat_name}: {admins_list}")
    except Exception as e:
        logger.error(f"Failed to get channel admins: {e}")

    data = dict(
        name=chat_name,
        tg_id=chat_id,
        is_bot_installed=True,
        meta=update.to_dict(),
        avatar=photo_file,
        invitation_link=chat.invite_link,
        publish_status="pending",
        admins=admins_list,  # CHANGE: Добавляем список админов
    )

    logger.info(f"BOT ADDED TO CHANNEL: {chat_name} (tg_id={chat_id})")
    logger.info(f"Sending channel data to backend: {data}")
    service = MainService()
    response = service.added_to_channel(data)
    logger.info(f"Backend response status: {response.status_code}")
    if response.status_code >= 400:
        logger.error(f"Backend error response: {response.text}")


async def channel_bot_status_handle(update, context):
    update_dict = update.to_dict()
    if update_dict["my_chat_member"]["new_chat_member"]["status"] == "administrator":
        await channel_handle_add(update, context)
        await publish_channel_message(update, context)
    elif update_dict["my_chat_member"]["new_chat_member"]["status"] in {
        "kicked",
        "left",
    }:
        await channel_handle_kicked(update, context)
