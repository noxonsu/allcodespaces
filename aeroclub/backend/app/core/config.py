import os
from pydantic_settings import BaseSettings, SettingsConfigDict

# Determine the path to the .env file, which should be in the 'backend' directory.
# __file__ is .../aeroclub/backend/app/core/config.py
# os.path.dirname(__file__) is .../aeroclub/backend/app/core
# os.path.dirname(os.path.dirname(__file__)) is .../aeroclub/backend/app
# os.path.dirname(os.path.dirname(os.path.dirname(__file__))) is .../aeroclub/backend
DOTENV_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env')

class Settings(BaseSettings):
    ADMIN_USERNAME: str = "your_admin_login"
    ADMIN_PASSWORD: str = "your_admin_password" # This will be plain text from .env for initial setup
    TELEGRAM_BOT_TOKEN: str
    TELEGRAM_MINI_APP_BASE_URL: str # Добавлено для базового URL QR-кода
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Pydantic-settings configuration
    model_config = SettingsConfigDict(
        env_file=DOTENV_PATH,
        env_file_encoding='utf-8',
        extra='ignore'  # Ignore extra fields in .env if any
    )

settings = Settings()

# You can optionally print to verify settings are loaded, e.g., during development.
# print(f"Loaded settings: ADMIN_USERNAME={settings.ADMIN_USERNAME}, BOT_TOKEN_LOADED={'YES' if settings.TELEGRAM_BOT_TOKEN else 'NO'}")
