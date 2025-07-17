from pydantic_settings import BaseSettings, SettingsConfigDict


class BotSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
    )
    BOT_TOKEN: str = '8158548460:AAGPHgyYtS6b4G1zbjn1cs3CDUM3RpwbpV0'
    SCHEMA_DOMAIN: str = 'https://app.telewin.online'
    DEV: bool = False
    PORT: int = 8001


bot_settings = BotSettings()