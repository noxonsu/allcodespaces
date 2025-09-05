from utils import channel_bot_status_handle, _public_message
from logger import logger
from parsers import UpdateFromUserParser, CampaignChannelParserIn
from services import MainService
from telegram import Update
from telegram.ext import ContextTypes


async def admin_start_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    tg_response = await context.bot.send_message(
        text="Searching for user Please wait..", chat_id=update.message.chat_id
    )
    from_user = UpdateFromUserParser.model_validate(update.message.from_user)
    service = MainService()
    logger.info(f"channel_admin_join: {from_user} is joining")
    service.channel_admin_join(from_user)
    welcome_text = """
    Добро пожаловать в ТЕЛЕВИН — платформу пассивного дохода на рекламе в Telegram!\n
    Website – https://telewin.online/\n
    Канал — https://t.me/telewin_online\n
    Личный кабинет – https://app.telewin.online
    """
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
