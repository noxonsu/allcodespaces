import datetime

from telegram import InlineKeyboardButton, InlineKeyboardMarkup

from parsers import CampaignChannelParserIn


async def _publish_messages_logic(bot, campaign_channel, kwargs, posts_data):
    post = None

    def _parse_campaign_button(campaign_channel: CampaignChannelParserIn):
        buttons = campaign_channel.campaign.message.buttons or []
        if not buttons:
            primary = campaign_channel.campaign.message.primary_button
            if primary:
                buttons = [primary]

        keyboard_rows = []
        for btn in buttons:
            url = btn.url if hasattr(btn, "url") else btn.get("url")
            title = btn.title if hasattr(btn, "title") else btn.get("text")
            if not url or not title:
                continue
            keyboard_rows.append([InlineKeyboardButton(title, url=url)])

        if not keyboard_rows:
            return None

        return InlineKeyboardMarkup(keyboard_rows)

    if campaign_channel.has_message_button:
        reply_markup = _parse_campaign_button(campaign_channel)
        if reply_markup:
            kwargs["reply_markup"] = reply_markup

    if campaign_channel.has_message_video:
        post = await bot.send_video(
            video=open(campaign_channel.campaign.message.video_local_path, "rb"),
            chat_id=campaign_channel.channel.tg_id,
            parse_mode="HTML",
            caption=campaign_channel.message_as_text,
            **kwargs,
        )
    elif campaign_channel.has_message_image:
        post = await bot.send_photo(
            photo=open(campaign_channel.campaign.message.image_local_path, "rb"),
            chat_id=campaign_channel.channel.tg_id,
            parse_mode="HTML",
            caption=campaign_channel.campaign.message.as_text,
            **kwargs,
        )
    elif (
        not campaign_channel.has_message_image
        and not campaign_channel.has_message_video
    ):
        post = await bot.send_message(
            chat_id=campaign_channel.channel.tg_id,
            parse_mode="HTML",
            text=campaign_channel.campaign.message.as_text,
            **kwargs,
        )
    if post:
        posts_data.append(
            {
                "id": campaign_channel.campaign.message.id,
                "channel_post_id": post["message_id"],
                "message_publish_date": str(datetime.datetime.now()),
                "publish_status": "published",
                "campaign_channel_id": str(campaign_channel.id),
            }
        )
