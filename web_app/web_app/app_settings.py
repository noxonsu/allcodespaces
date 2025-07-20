from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="./.env",
    )
    DB_ENGINE: str = ''
    DB_USERNAME: str = ''
    DB_PASS:  str = ''
    DB_HOST:  str = 'db'
    DB_PORT:  str = ''
    DB_NAME:  str = 'db.sqlite3'
    # APP_MODE: str = 'dev' # prod, dev
    SECRET_KEY: str = 'super-secret'
    DEBUG: bool = False
    ALLOWED_HOSTS: list[str] = ['localhost', '127.0.0.1', 'app.telewin.online']
    DOMAIN_URI: str = 'https://app.telewin.online'
    DJANGO_SETTINGS_MODULE: str = 'web_app.settings'

app_settings = AppSettings()
