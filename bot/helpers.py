import datetime

from telegram import InlineKeyboardButton, InlineKeyboardMarkup

from parsers import CampaignChannelParserIn


async def _publish_messages_logic(bot, campaign_channel, kwargs, posts_data):
    post = None

    def _parse_campaign_button(campaign_channel: CampaignChannelParserIn):
        keyboard = [
            [
                InlineKeyboardButton(
                    campaign_channel.campaign.message.button.title,
                    url=campaign_channel.analysis_link),
            ]
        ]
        return InlineKeyboardMarkup(keyboard)

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
    elif not campaign_channel.has_message_image and not campaign_channel.has_message_video:
        post = await bot.send_message(
            chat_id=campaign_channel.channel.tg_id,
            parse_mode='HTML',
            text=campaign_channel.campaign.message.as_text, **kwargs)
    if post:
        posts_data.append(
            {
                'id': campaign_channel.campaign.message.id,
                'channel_post_id': post['message_id'],
                'message_publish_date': str(datetime.datetime.now()),
                "is_message_published": True,
                "publish_status": 'published',
                "campaign_channel_id": str(campaign_channel.id),
            }
        )
