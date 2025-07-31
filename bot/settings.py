from pydantic_settings import BaseSettings, SettingsConfigDict


class BotSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
    )
    BOT_TOKEN: str
    SCHEMA_DOMAIN: str = 'https://app.telewin.online'
    DEV: bool = False
    PORT: int = 8001
    BOT_USERNAME: str = ""
    BOT_NAME: str = ""


bot_settings = BotSettings()