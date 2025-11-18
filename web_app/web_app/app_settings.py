from __future__ import annotations

from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="./.env",
    )
    DB_ENGINE: str = ""
    DB_USERNAME: str = ""
    DB_PASS: str = ""
    DB_HOST: str = "db"
    DB_PORT: str = ""
    DB_NAME: str = "db.sqlite3"
    # APP_MODE: str = 'dev' # prod, dev
    SECRET_KEY: str = "super-secret"
    DEBUG: bool = False
    ALLOWED_HOSTS: List[str] = ["localhost", "127.0.0.1", "app.telewin.online", "telewin.wpmix.net"]
    DOMAIN_URI: str = "https://app.telewin.online"
    TELEGRAM_BOT_USERNAME: str = "telewin_0001_bot"
    DJANGO_SETTINGS_MODULE: str = "web_app.settings"

    # CHANGE: Added microservice integration settings
    # WHY: Required by ТЗ 4.1.1 - webhook notifications for channel add/delete
    # QUOTE(ТЗ): "при изменении статуса канала отправлять событие микросервису парсинга"
    # REF: issue #45
    PARSER_MICROSERVICE_URL: str = ""
    PARSER_MICROSERVICE_API_KEY: str = ""
    PARSER_MICROSERVICE_ENABLED: bool = False


app_settings = AppSettings()
