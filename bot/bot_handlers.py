from utils import channel_bot_status_handle, _public_message
from logger import logger
from parsers import UpdateFromUserParser, CampaignChannelParserIn
from services import MainService
from settings import bot_settings
from telegram import Update
from telegram.ext import ContextTypes


async def admin_start_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # CHANGE: Added preview token handling in /start command
    # WHY: Issue #52 requires bot to accept preview tokens and send message previews
    # REF: #52

    # Check if there's a token parameter in /start command
    args = context.args
    if args and len(args) > 0:
        token = args[0]
        logger.info(f"Preview token received: {token}")

        service = MainService()
        preview_data = service.resolve_preview_token(token)

        if not preview_data:
            await context.bot.send_message(
                text="❌ Ссылка недействительна или уже использована.",
                chat_id=update.message.chat_id,
            )
            logger.warning(f"Invalid or expired preview token: {token}")
            return

        # Extract message data
        message_data = preview_data.get("message", {})
        logger.info(f"Sending preview for message_id={message_data.get('id')}")

        # Send preview message
        kwargs = {}

        # Handle buttons
        buttons = message_data.get("buttons") or []
        if not buttons:
            primary = message_data.get("button")
            if primary:
                buttons = [primary]

        if buttons:
            from telegram import InlineKeyboardButton, InlineKeyboardMarkup
            keyboard_rows = []
            for btn in buttons:
                url = btn.get("url")
                title = btn.get("title") or btn.get("text")
                if url and title:
                    keyboard_rows.append([InlineKeyboardButton(title, url=url)])
            if keyboard_rows:
                kwargs["reply_markup"] = InlineKeyboardMarkup(keyboard_rows)

        # Send message based on media type
        try:
            video = message_data.get("video")
            image = message_data.get("image")
            text = message_data.get("as_text", "")

            if video:
                await context.bot.send_video(
                    video=video,
                    chat_id=update.message.chat_id,
                    parse_mode="HTML",
                    caption=text,
                    **kwargs,
                )
            elif image:
                await context.bot.send_photo(
                    photo=image,
                    chat_id=update.message.chat_id,
                    parse_mode="HTML",
                    caption=text,
                    **kwargs,
                )
            else:
                await context.bot.send_message(
                    chat_id=update.message.chat_id,
                    parse_mode="HTML",
                    text=text,
                    **kwargs,
                )

            logger.info(f"Preview sent successfully for token {token}")
        except Exception as e:
            logger.error(f"Error sending preview: {e}")
            await context.bot.send_message(
                text="❌ Ошибка при отправке предпросмотра.",
                chat_id=update.message.chat_id,
            )
        return

    # Regular /start flow (no token)
    tg_response = await context.bot.send_message(
        text="Searching for user Please wait..", chat_id=update.message.chat_id
    )
    from_user = UpdateFromUserParser.model_validate(update.message.from_user)
    service = MainService()
    logger.info(f"channel_admin_join: {from_user} is joining")
    service.channel_admin_join(from_user)
    welcome_text =("Добро пожаловать в ТЕЛЕВИН — платформу пассивного дохода на рекламе в Telegram!\n"+
    "Website – https://telewin.online/\n"+
    "Канал — https://t.me/telewin_online\n"+
    f"Личный кабинет – {bot_settings.SCHEMA_DOMAIN}\n"+
    "Инструкция – https://telewin.online/instruction\n")

    await context.bot.edit_message_text(
        text=welcome_text,
        chat_id=update.message.chat_id,
        message_id=tg_response.message_id,
    )


async def handle_all_messages(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.channel_post and not update.edited_channel_post:
        return
    elif update.edited_channel_post:
        text = update.edited_channel_post.text
        channel_tg_id = update.edited_channel_post.chat_id
        logger.info(f"handle_all_messages: Edited message ({channel_tg_id=}) {text=}")
    elif update.channel_post:
        text = update.channel_post.text
        channel_tg_id = update.channel_post.chat_id
        logger.info(f"handle_all_messages: New message post ({channel_tg_id=}) {text=}")

    service: MainService = MainService(parser=CampaignChannelParserIn)
    words = service.parser.parse_tg_message(text)
    service.unpublished_campaign_channel_by_words(
        channel_tg_id=channel_tg_id, words=words
    )
    posted_data = await _public_message(context.bot, service.parse())
    if service.has_data():
        for public_message in posted_data:
            logger.info(f"SENDING {posted_data}")
            service.update_public_messages_info(
                public_message["campaign_channel_id"], public_message
            )


async def handle_channel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await channel_bot_status_handle(update, context)


async def campaign_channel_approve_button(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    query = update.callback_query
    await query.answer()
    _, campaign_channel_id = query.data.split(":")
    service = MainService()
    service.campaign_channel_approve(campaign_channel_id)
    await query.edit_message_text("Новая рекламная кампания одобрено ✅")


async def campaign_channel_decline_button(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    query = update.callback_query
    await query.answer()
    _, campaign_channel_id = query.data.split(":")
    service = MainService()
    service.campaign_channel_decline(campaign_channel_id)
    await query.edit_message_text("Новая рекламная кампания отклонено. ❌")
