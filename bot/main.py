import asyncio
from datetime import datetime, timezone as dt_timezone

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
    CommandHandler,
)

from telegram import Update
from telegram import InlineKeyboardButton, InlineKeyboardMarkup

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response, JSONResponse
from starlette.routing import Route


async def main():
    context_types = ContextTypes(context=CustomContext)
    application = (
        Application.builder()
        .token(bot_settings.BOT_TOKEN)
        .updater(None)
        .context_types(context_types)
        .build()
    )
    await application.bot.set_my_description("""
        👑 Этот бот управляет сообщениями рекламных кампаний для каналов TG. 👑
            /start to add a Channel Admin
    """)
    await application.bot.set_my_short_description(
        """👑 Этот бот управляет сообщениями рекламных кампаний для каналов TG.👑"""
    )

    chat_member_event = ChatMemberHandler(handle_channel)
    application.add_handler(chat_member_event)
    start_command = CommandHandler("start", admin_start_handler)
    application.add_handler(start_command)
    message_handler = MessageHandler(callback=handle_all_messages, filters=None)
    application.add_handler(
        CallbackQueryHandler(
            campaign_channel_approve_button, pattern="@#!approve_campaign_:.+"
        )
    )
    application.add_handler(
        CallbackQueryHandler(
            campaign_channel_decline_button, pattern="@#!decline_campaign_:.+"
        )
    )
    application.add_handler(message_handler)

    comands = await application.bot.get_my_commands()
    await application.bot.set_my_commands(comands)

    await application.bot.set_webhook(
        url=f"{bot_settings.SCHEMA_DOMAIN}/telegram", allowed_updates=Update.ALL_TYPES
    )

    async def telegram(request: Request) -> Response:
        """Handle incoming Telegram updates by putting them into the `update_queue`"""
        await application.update_queue.put(
            Update.de_json(data=await request.json(), bot=application.bot)
        )
        return Response()

    async def public_campaign_channel(request: Request) -> Response:
        from utils import _public_message

        request = await request.json()
        campaign_channel: CampaignChannelParserIn = (
            CampaignChannelParserIn.model_validate(request)
        )
        # НЕ перезаписываем channel.tg_id - он должен остаться tg_id канала, а не админа!

        # Проверяем требует ли канал ручного подтверждения
        auto_approve = getattr(campaign_channel.channel, "auto_approve_publications", None)
        if auto_approve is None:
            # Обратная совместимость со старым атрибутом
            auto_approve = not getattr(campaign_channel.channel, "require_manual_approval", True)
        require_manual_approval = not bool(auto_approve)

        publish_at = campaign_channel.message_publish_date
        if isinstance(publish_at, str):
            try:
                publish_at = datetime.fromisoformat(publish_at)
            except ValueError:
                publish_at = None
        if publish_at and publish_at.tzinfo is None:
            publish_at = publish_at.replace(tzinfo=dt_timezone.utc)

        async def publish_messages():
            from services import MainService
            posts_data = await _public_message(application.bot, [campaign_channel])
            # Обновляем channel_post_id в БД после публикации
            if posts_data:
                service = MainService()
                for post_data in posts_data:
                    service.update_public_messages_info(
                        post_data["campaign_channel_id"], post_data
                    )

        # Если требуется ручное подтверждение - отправляем уведомление с кнопками
        if require_manual_approval:
            keyboard = [
                [
                    InlineKeyboardButton(
                        "Разрешить 👍",
                        callback_data=f"@#!approve_campaign_:{campaign_channel.id}",
                    ),
                    InlineKeyboardButton(
                        "Отклонить ⛔",
                        callback_data=f"@#!decline_campaign_:{campaign_channel.id}",
                    ),
                ]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            format_label = (
                campaign_channel.campaign.format_display or campaign_channel.campaign.format
            )
            scheduled_info = (
                f", Публикация: {campaign_channel.scheduled_publication_at}"
                if campaign_channel.scheduled_publication_at
                else ""
            )
            slot = campaign_channel.publication_slot or {}
            slot_info = ""
            if slot:
                slot_info = f", Слот: {slot.get('weekday')} {slot.get('start_time')}-{slot.get('end_time')}"

            msg_txt: str = (
                "Получен запрос на публикацию рекламного сообщения в вашем канале. "
                f"Рекламодатель: {campaign_channel.campaign.client}, "
                f"Бренд: {campaign_channel.campaign.brand}, "
                f"Формат: {format_label}"
                f"{scheduled_info}, План. CPM {campaign_channel.plan_cpm}{slot_info}"
            )
            await application.bot.send_message(
                chat_id=campaign_channel.channel_admin.tg_id,
                text=msg_txt,
                parse_mode=ParseMode.HTML,
                reply_markup=reply_markup,
            )
        else:
            # Автоматическое размещение - публикуем сразу
            if publish_at:
                now = datetime.now(publish_at.tzinfo or dt_timezone.utc)
                delay = (publish_at - now).total_seconds()
                if delay > 5:
                    async def delayed_publish():
                        await asyncio.sleep(delay)
                        await publish_messages()

                    asyncio.create_task(delayed_publish())
                else:
                    await publish_messages()
            else:
                await publish_messages()

        return JSONResponse({"status": "ok"})

    async def channeladmin_added(request: Request) -> Response:
        try:
            request = await request.json()
            await application.bot.send_message(
                chat_id=request['tg_id'],
                text=request['msg'],
                parse_mode=ParseMode.HTML,
            )
            return JSONResponse({"status": "ok"})
        except Exception as e:
            print(f"BOT:[channeladmin_added] {e}")
            return JSONResponse({"status": "error"}, status_code=500)

    starlette_app = Starlette(
        routes=[
            Route("/telegram", telegram, methods=["POST"]),
            Route("/telegram/channeladmin-added", channeladmin_added, methods=["POST"]),
            Route(
                "/telegram/public-campaign-channel",
                public_campaign_channel,
                methods=["POST"],
            ),
        ]
    )

    webserver = uvicorn.Server(
        config=uvicorn.Config(
            app=starlette_app,
            port=bot_settings.PORT,
            use_colors=True,
            host="0.0.0.0",
            reload=True,  # Автоперезагрузка при изменении файлов
        )
    )

    async with application:
        await application.start()
        await webserver.serve()
        await application.stop()


if __name__ == "__main__":
    asyncio.run(main())
