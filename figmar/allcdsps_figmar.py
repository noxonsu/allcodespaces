import os
import asyncio
import logging
from pathlib import Path
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import CommandStart
from aiogram.enums import ParseMode
import sys # Добавляем импорт sys

# Добавляем корневую директорию проекта в sys.path для абсолютных импортов
sys.path.append(str(Path(__file__).parent.parent))

# Импорт утилит из нового файла
from figmar.figmar_lib.utils import escape_markdown, format_analysis_markdown, split_long_message, send_image_safely, send_formatted_message

# --- Загрузка переменных окружения ---
# Загружаем из .env в той же директории, что и бот
dotenv_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=dotenv_path)

TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
SYSTEM_PROMPT = os.getenv('SYSTEM_PROMPT', "Пришлите ссылку на Figma или изображение для анализа.")

# --- Настройка логирования ---
logging.basicConfig(level=logging.INFO)

# --- Проверка наличия токена ---
if not TELEGRAM_BOT_TOKEN:
    logging.critical("Токен для Telegram бота не найден. Установите TELEGRAM_BOT_TOKEN в .env файле.")
    exit()

# --- Импорт библиотеки анализатора ---
try:
    from figmar.figmar_lib.analyzer import fetch_all_data_and_analyze_figma, analyze_figma_data_with_llm
except ImportError as e:
    logging.critical(f"Не удалось импортировать библиотеку анализатора: {e}. Убедитесь, что figmar/figmar_lib/analyzer.py доступен.")
    
    # Создаем заглушки для функций, чтобы бот мог запуститься
    async def fetch_all_data_and_analyze_figma(url): # Удаляем message из сигнатуры
        return {
            'summary': 'Модуль анализатора недоступен. Установите необходимые зависимости.',
            'dataPath': '',
            'intermediateAnalyses': []
        }
    
    async def analyze_figma_data_with_llm(prompt, image_path):
        return 'Модуль анализатора недоступен. Установите необходимые зависимости.'
    
    logging.warning("Используются заглушки для функций анализа.")

# --- Инициализация бота и диспетчера ---
bot = Bot(token=TELEGRAM_BOT_TOKEN)
dp = Dispatcher()

# --- Обработчики сообщений ---

@dp.message(CommandStart())
async def send_welcome(message: types.Message):
    """
    Обработчик команды /start. Отправляет приветственное сообщение.
    """
    welcome_text = f"*Добро пожаловать в Figma Analyzer Bot\\!*\n\n{escape_markdown(SYSTEM_PROMPT)}"
    try:
        await message.reply(welcome_text, parse_mode=ParseMode.MARKDOWN_V2)
    except Exception:
        await message.reply(SYSTEM_PROMPT)

@dp.message(F.text)
async def handle_text(message: types.Message):
    """
    Обрабатывает текстовые сообщения. Если это ссылка на Figma, запускает анализ.
    """
    text = message.text.strip()
    if text.startswith("https://www.figma.com/"):
        status_text = "🔄 *Получил ссылку на Figma\\!*\n\nНачинаю анализ, это может занять несколько минут\\.\\.\\."
        try:
            await message.reply(status_text, parse_mode=ParseMode.MARKDOWN_V2)
        except Exception:
            await message.reply("Получил ссылку на Figma. Начинаю анализ, это может занять несколько минут...")
        
        try:
            # Уведомляем о начале загрузки данных
            progress_text = "📥 *Загружаю данные из Figma\\.\\.\\.*"
            try:
                await message.answer(progress_text, parse_mode=ParseMode.MARKDOWN_V2)
            except Exception:
                await message.answer("📥 Загружаю данные из Figma...")
            
            # Передаем объект message в функцию анализатора
            result = await fetch_all_data_and_analyze_figma(text) # Удаляем message из аргументов
            
            # Уведомляем о завершении загрузки
            loading_complete_text = "✅ *Данные загружены\\!* Отправляю результаты\\.\\.\\."
            try:
                await message.answer(loading_complete_text, parse_mode=ParseMode.MARKDOWN_V2)
            except Exception:
                await message.answer("✅ Данные загружены! Отправляю результаты...")
            
            summary = result.get('summary', 'Анализ завершен, но отчет пуст.')
            data_path = result.get('dataPath', '')
            intermediate_analyses = result.get('intermediateAnalyses', [])
            node_images_paths = result.get('nodeImagesPaths', {}) # Получаем пути к изображениям страниц

            # Отправляем изображения страниц
            images_sent = 0
            if node_images_paths:
                header_text = "📄 *Изображения страниц:*"
                try:
                    await message.answer(header_text, parse_mode=ParseMode.MARKDOWN_V2)
                except Exception:
                    await message.answer("📄 Изображения страниц:")
                
                for node_id, local_image_path in node_images_paths.items():
                    if local_image_path:
                        page_name = node_id.replace(':', '_') # Используем node_id как имя страницы
                        caption = f"📄 *Страница:* `{escape_markdown(page_name)}`"
                        if await send_image_safely(message, local_image_path, caption):
                            images_sent += 1
                        else:
                            fallback_text = f"📄 *Страница:* `{escape_markdown(page_name)}` _(изображение недоступно)_"
                            try:
                                await message.answer(fallback_text, parse_mode=ParseMode.MARKDOWN_V2)
                            except Exception:
                                await message.answer(f"📄 Страница: {page_name} (изображение недоступно)")
                        await asyncio.sleep(0.5) # Небольшая пауза

            # Отправляем промежуточные анализы страниц
            if intermediate_analyses:
                header_text = "📊 *Анализ отдельных страниц:*"
                try:
                    await message.answer(header_text, parse_mode=ParseMode.MARKDOWN_V2)
                except Exception:
                    await message.answer("📊 Анализ отдельных страниц:")
                
                for i, analysis_data in enumerate(intermediate_analyses):
                    page_name = analysis_data.get('page_name', 'Неизвестная страница')
                    analysis_text = analysis_data.get('analysis', '')
                    image_path_col = analysis_data.get('image_path_col', None) # Путь к изображению колонки

                    if image_path_col and Path(image_path_col).exists():
                        caption_col = f"📱 *Колонка:* `{escape_markdown(Path(image_path_col).stem.replace('_', ' ').title())}`"
                        await send_image_safely(message, image_path_col, caption_col)
                        await asyncio.sleep(0.5) # Небольшая пауза

                    if analysis_text:
                        await send_formatted_message(
                            message, 
                            analysis_text, 
                            f"🔍 Анализ страницы '{page_name}'"
                        )
                        await asyncio.sleep(0.5) # Небольшая пауза между отправками

            # Отправляем итоговый анализ в конце
            await send_formatted_message(message, summary, "📋 Итоговый анализ")
            
            # Отправляем статистику
            stats_text = f"✅ *Анализ завершен\\!*\n\n📊 Отправлено изображений: {images_sent}\n📄 Анализов страниц: {len(intermediate_analyses)}"
            try:
                await message.answer(stats_text, parse_mode=ParseMode.MARKDOWN_V2)
            except Exception:
                await message.answer(f"✅ Анализ завершен! Отправлено изображений: {images_sent}, анализов страниц: {len(intermediate_analyses)}")

        except Exception as e:
            logging.error(f"Ошибка при анализе Figma URL: {e}")
            # Всегда отправляем сообщение об ошибке пользователю
            error_text = f"❌ *Произошла ошибка при анализе:*\n\n`{escape_markdown(str(e))}`\n\n_Попробуйте еще раз или обратитесь к администратору\\._"
            try:
                await message.reply(error_text, parse_mode=ParseMode.MARKDOWN_V2)
            except Exception:
                await message.reply(f"❌ Произошла ошибка при анализе: {e}\n\nПопробуйте еще раз или обратитесь к администратору.")
    else:
        error_text = "❌ *Это не похоже на ссылку на Figma\\.*\n\nПожалуйста, отправьте корректную ссылку\\."
        try:
            await message.reply(error_text, parse_mode=ParseMode.MARKDOWN_V2)
        except Exception:
            await message.reply("Это не похоже на ссылку на Figma. Пожалуйста, отправьте корректную ссылку.")

@dp.message(F.photo)
async def handle_photo(message: types.Message):
    """
    Обрабатывает полученные изображения.
    """
    status_text = "📷 *Получил изображение\\!*\n\nНачинаю анализ\\.\\.\\."
    try:
        await message.reply(status_text, parse_mode=ParseMode.MARKDOWN_V2)
    except Exception:
        await message.reply("Получил изображение. Начинаю анализ...")
    
    # Создаем директорию для временных файлов, если ее нет
    temp_dir = Path(__file__).parent / "temp_images"
    temp_dir.mkdir(exist_ok=True)
    
    photo_path = temp_dir / f"{message.photo[-1].file_id}.jpg"
    
    try:
        # Скачиваем файл
        download_text = "⬇️ *Скачиваю изображение\\.\\.\\.*"
        try:
            await message.answer(download_text, parse_mode=ParseMode.MARKDOWN_V2)
        except Exception:
            await message.answer("⬇️ Скачиваю изображение...")
            
        await bot.download(message.photo[-1], destination=str(photo_path))
        
        # Отправляем обратно изображение с подтверждением
        confirmation_text = "✅ *Получил ваше изображение\\.*\n\nАнализирую\\.\\.\\."
        if await send_image_safely(message, photo_path, confirmation_text):
            pass  # Изображение отправлено успешно
        else:
            # Если не удалось отправить изображение, просто уведомляем
            try:
                await message.answer(confirmation_text, parse_mode=ParseMode.MARKDOWN_V2)
            except Exception:
                await message.answer("✅ Получил ваше изображение. Анализирую...")
        
        # Загружаем промпт для анализа изображений
        analyze_text = "🔍 *Анализирую изображение\\.\\.\\.*"
        try:
            await message.answer(analyze_text, parse_mode=ParseMode.MARKDOWN_V2)
        except Exception:
            await message.answer("🔍 Анализирую изображение...")
            
        try:
            image_prompt_file = Path(__file__).parent / '.env.image_analyse_prompt'
            if image_prompt_file.exists():
                image_prompt = image_prompt_file.read_text(encoding='utf-8')
            else:
                image_prompt = "Проанализируй это изображение интерфейса. Опиши что видишь: элементы UI, цветовую схему, типографику, общий стиль дизайна."
                logging.warning(f"Файл промпта не найден: {image_prompt_file}. Используется стандартный промпт.")
        except Exception as e:
            image_prompt = "Проанализируй это изображение интерфейса. Опиши что видишь: элементы UI, цветовую схему, типографику, общий стиль дизайна."
            logging.warning(f"Ошибка при загрузке промпта: {e}. Используется стандартный промпт.")
        
        # Вызываем функцию анализа изображения
        analysis_result = await analyze_figma_data_with_llm(image_prompt, str(photo_path))
        
        # Отправляем результат
        await send_formatted_message(message, analysis_result, "🖼️ Анализ изображения")
        
        # Уведомляем о завершении
        complete_text = "✅ *Анализ изображения завершен\\!*"
        try:
            await message.answer(complete_text, parse_mode=ParseMode.MARKDOWN_V2)
        except Exception:
            await message.answer("✅ Анализ изображения завершен!")

    except Exception as e:
        logging.error(f"Ошибка при обработке изображения: {e}")
        # Всегда отправляем сообщение об ошибке
        error_text = f"❌ *Произошла ошибка при обработке изображения:*\n\n`{escape_markdown(str(e))}`\n\n_Попробуйте еще раз\\._"
        try:
            await message.reply(error_text, parse_mode=ParseMode.MARKDOWN_V2)
        except Exception:
            await message.reply(f"❌ Произошла ошибка при обработке изображения: {e}\n\nПопробуйте еще раз.")
    finally:
        # Удаляем временный файл
        if photo_path.exists():
            photo_path.unlink()


# --- Основная функция запуска бота ---
async def main():
    """
    Запускает бота.
    """
    logging.info("Запуск Telegram бота...")
    await dp.start_polling(bot)

if __name__ == '__main__':
    asyncio.run(main())
