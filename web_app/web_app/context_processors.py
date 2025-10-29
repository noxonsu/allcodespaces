from .app_settings import app_settings


def telewin_settings(request):
    return {
        "TELEGRAM_BOT_USERNAME": app_settings.TELEGRAM_BOT_USERNAME,
        "TELEGRAM_BOT_AUTH_URL": "/api/login/tg",
    }

