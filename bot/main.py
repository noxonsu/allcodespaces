import asyncio

import uvicorn
from telegram.constants import ParseMode

from parsers import CampaignChannelParserIn
from bot_handlers import (
    handle_channel,
    admin_start_handler,
    handle_all_messages,
    campaign_channel_approve_button,
    campaign_channel_decline_button,
)
from settings import bot_settings
from webhooks_utils import CustomContext

from telegram.ext import (
    Application,
    ContextTypes,
    MessageHandler,
    ChatMemberHandler,
    CallbackQueryHandler,
    CommandHandler)

from telegram import Update
from telegram import InlineKeyboardButton, InlineKeyboardMarkup

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response, JSONResponse
from starlette.routing import Route

from http import HTTPStatus


async def main():
    context_types = ContextTypes(context=CustomContext)
    application = (
        Application.builder().token(bot_settings.BOT_TOKEN).updater(None).context_types(context_types).build()
    )
    await application.bot.set_my_description("""
        👑 Этот бот управляет сообщениями рекламных кампаний для каналов TG. 👑
            /start to add a Channel Admin
    """)
    await application.bot.set_my_short_description("""👑 Этот бот управляет сообщениями рекламных кампаний для каналов TG.👑""")

    chat_member_event = ChatMemberHandler(handle_channel)
    application.add_handler(chat_member_event)
    start_command = CommandHandler('start', admin_start_handler)
    application.add_handler(start_command)
    message_handler = MessageHandler(callback=handle_all_messages, filters=None)
    application.add_handler(CallbackQueryHandler(campaign_channel_approve_button, pattern='@#!approve_campaign_:.+'))
    application.add_handler(CallbackQueryHandler(campaign_channel_decline_button, pattern='@#!decline_campaign_:.+'))
    application.add_handler(message_handler)

    comands= await application.bot.get_my_commands()
    await application.bot.set_my_commands(comands)

    await application.bot.set_webhook(url=f"{bot_settings.SCHEMA_DOMAIN}/telegram", allowed_updates=Update.ALL_TYPES)

    async def telegram(request: Request) -> Response:
        """Handle incoming Telegram updates by putting them into the `update_queue`"""
        await application.update_queue.put(
            Update.de_json(data=await request.json(), bot=application.bot)
        )
        return Response()

    async def public_campaign_channel(request: Request) -> Response:
        from utils import _public_message
        request = await request.json()
        campaign_channel: CampaignChannelParserIn = CampaignChannelParserIn.model_validate(request)
        campaign_channel.channel.tg_id = campaign_channel.channel_admin.tg_id
        await _public_message(application.bot, [campaign_channel])

        keyboard = [
            [
                InlineKeyboardButton('Разрешить 👍', callback_data=f'@#!approve_campaign_:{campaign_channel.id}'),
                InlineKeyboardButton('Отклонить ⛔', callback_data=f'@#!decline_campaign_:{campaign_channel.id}'),
            ]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        msg_txt: str = f"""
            <b><i>📨 Получен запрос на публикацию рекламного сообщения в вашем канале:📬. </i></b>
            🪧 <b><i>Рекламодатель</i></b>: {campaign_channel.campaign.client},
            🪧 <b><i>Бренд</i></b>: {campaign_channel.campaign.brand},
            🪧 <b><i>CPM</i></b>: {campaign_channel.channel.cpm}
        """
        await application.bot.send_message(
            chat_id=campaign_channel.channel_admin.tg_id,
            text=msg_txt,
            parse_mode=ParseMode.HTML,
            reply_markup=reply_markup
        )
        return JSONResponse({"status": "ok"})


    starlette_app = Starlette(routes=[
            Route("/telegram", telegram, methods=["POST"]),
            Route("/telegram/public-campaign-channel", public_campaign_channel, methods=["POST"])])

    webserver = uvicorn.Server(
        config=uvicorn.Config(
            app=starlette_app,
            port=bot_settings.PORT,
            use_colors=True,
            host="0.0.0.0",
        )
    )

    async with application:
        await application.start()
        await webserver.serve()
        await application.stop()


if __name__ == "__main__":
    asyncio.run(main())