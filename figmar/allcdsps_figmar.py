import os
import asyncio
import logging
from pathlib import Path
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import CommandStart
from aiogram.enums import ParseMode
import re

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
    from figma_analyzer import fetch_all_data_and_analyze_figma, analyze_figma_data_with_llm
except ImportError as e:
    logging.warning(f"Не удалось импортировать figma_analyzer: {e}. Попробуем figmar_lib.analyzer.")
    try:
        from figmar_lib.analyzer import fetch_all_data_and_analyze_figma, analyze_figma_data_with_llm
    except ImportError as e:
        logging.warning(f"Не удалось импортировать figmar_lib.analyzer: {e}. Попробуем импортировать из текущей директории.")
        try:
            # Попробуем импортировать из текущей директории
            import sys
            sys.path.append(str(Path(__file__).parent))
            from figma_analyzer import fetch_all_data_and_analyze_figma, analyze_figma_data_with_llm
        except ImportError as e:
            logging.critical(f"Не удалось импортировать библиотеку анализатора ни одним способом: {e}. Убедитесь, что figma_analyzer.py доступен.")
            
            # Создаем заглушки для функций, чтобы бот мог запуститься
            async def fetch_all_data_and_analyze_figma(url):
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

# --- Вспомогательные функции для форматирования ---

def escape_markdown(text):
    """
    Экранирует специальные символы для MarkdownV2 в Telegram
    """
    escape_chars = r'_*[]()~`>#+-=|{}.!'
    return re.sub(f'([{re.escape(escape_chars)}])', r'\\\1', text)

def format_analysis_markdown(text, title="Анализ"):
    """
    Форматирует текст анализа с использованием Markdown
    """
    if not text or not text.strip():
        return f"*{escape_markdown(title)}*\n\nДанные отсутствуют"
    
    # Экранируем основной текст
    escaped_text = escape_markdown(text)
    
    # Форматируем заголовок
    formatted_title = f"*{escape_markdown(title)}*"
    
    # Добавляем разделители для лучшей читаемости
    formatted_text = f"{formatted_title}\n\n{escaped_text}"
    
    return formatted_text

def split_long_message(text, max_length=4096):
    """
    Разбивает длинные сообщения на части, сохраняя форматирование
    """
    if len(text) <= max_length:
        return [text]
    
    messages = []
    current_pos = 0
    
    while current_pos < len(text):
        # Находим подходящее место для разрыва
        end_pos = current_pos + max_length
        
        if end_pos >= len(text):
            messages.append(text[current_pos:])
            break
        
        # Ищем ближайший перенос строки перед лимитом
        break_pos = text.rfind('\n', current_pos, end_pos)
        if break_pos == -1 or break_pos == current_pos:
            # Если нет переноса строки, ищем пробел
            break_pos = text.rfind(' ', current_pos, end_pos)
            if break_pos == -1 or break_pos == current_pos:
                break_pos = end_pos
        
        messages.append(text[current_pos:break_pos])
        current_pos = break_pos + (1 if break_pos < len(text) and text[break_pos] in '\n ' else 0)
    
    return messages

async def send_formatted_message(message: types.Message, text: str, title: str = ""):
    """
    Отправляет отформатированное сообщение с разбивкой на части при необходимости
    """
    if title:
        formatted_text = format_analysis_markdown(text, title)
    else:
        formatted_text = escape_markdown(text)
    
    message_parts = split_long_message(formatted_text)
    
    for part in message_parts:
        try:
            await message.answer(part, parse_mode=ParseMode.MARKDOWN_V2)
        except Exception as e:
            logging.warning(f"Ошибка отправки с Markdown, отправляю как обычный текст: {e}")
            # Если не удалось отправить с разметкой, отправляем обычным текстом
            await message.answer(text)

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
            result = await fetch_all_data_and_analyze_figma(text)
            summary = result.get('summary', 'Анализ завершен, но отчет пуст.')
            data_path = result.get('dataPath', '')
            intermediate_analyses = result.get('intermediateAnalyses', [])
            
            # Если нет промежуточных анализов из функции, попробуем загрузить из кеша
            if not intermediate_analyses and data_path:
                data_dir = Path(data_path)
                for analysis_file in data_dir.glob('page_analysis_*.txt'):
                    try:
                        with open(analysis_file, 'r', encoding='utf-8') as f:
                            cached_analysis = f.read().strip()
                        if cached_analysis:
                            # Извлекаем имя страницы из имени файла
                            node_id = analysis_file.stem.replace('page_analysis_', '').replace('_', ':')
                            page_name = f"Страница {node_id}"
                            
                            intermediate_analyses.append({
                                'page_name': page_name,
                                'node_id': node_id,
                                'analysis': cached_analysis,
                                'image_path': None
                            })
                    except Exception as e:
                        logging.warning(f"Не удалось загрузить кешированный анализ {analysis_file}: {e}")
            
            # Отправляем изображения страниц, если они есть
            if data_path:
                data_dir = Path(data_path)
                images_dir = data_dir / 'images'
                columns_dir = Path(__file__).parent / 'columns_py_opencv_actual_images'
                
                # Отправляем оригинальные изображения страниц
                if images_dir.exists():
                    for image_file in images_dir.glob('*.png'):
                        try:
                            page_name = image_file.stem.replace('node_', '').replace('_', ':')
                            caption = f"📄 *Страница:* `{escape_markdown(page_name)}`"
                            await message.answer_photo(
                                photo=types.FSInputFile(str(image_file)),
                                caption=caption,
                                parse_mode=ParseMode.MARKDOWN_V2
                            )
                        except Exception as e:
                            logging.warning(f"Не удалось отправить изображение {image_file}: {e}")
                            # Fallback без форматирования
                            await message.answer_photo(
                                photo=types.FSInputFile(str(image_file)),
                                caption=f"📄 Страница: {image_file.stem.replace('node_', '').replace('_', ':')}"
                            )
                
                # Отправляем разделенные колонки, если они есть
                if columns_dir.exists():
                    for node_dir in columns_dir.iterdir():
                        if node_dir.is_dir():
                            column_files = sorted(node_dir.glob('column_*.png'))
                            if column_files:
                                header_text = f"🔧 *Разделенные колонки для страницы* `{escape_markdown(node_dir.name)}`:"
                                try:
                                    await message.answer(header_text, parse_mode=ParseMode.MARKDOWN_V2)
                                except Exception:
                                    await message.answer(f"🔧 Разделенные колонки для страницы {node_dir.name}:")
                                
                                for column_file in column_files:
                                    try:
                                        caption = f"📱 *{escape_markdown(column_file.stem.replace('_', ' ').title())}*"
                                        await message.answer_photo(
                                            photo=types.FSInputFile(str(column_file)),
                                            caption=caption,
                                            parse_mode=ParseMode.MARKDOWN_V2
                                        )
                                    except Exception as e:
                                        logging.warning(f"Не удалось отправить колонку {column_file}: {e}")
                                        await message.answer_photo(
                                            photo=types.FSInputFile(str(column_file)),
                                            caption=f"📱 {column_file.stem.replace('_', ' ').title()}"
                                        )
            
            # Отправляем промежуточные анализы страниц
            if intermediate_analyses:
                header_text = "📊 *Анализ отдельных страниц:*"
                try:
                    await message.answer(header_text, parse_mode=ParseMode.MARKDOWN_V2)
                except Exception:
                    await message.answer("📊 Анализ отдельных страниц:")
                
                for analysis_data in intermediate_analyses:
                    page_name = analysis_data.get('page_name', 'Неизвестная страница')
                    analysis_text = analysis_data.get('analysis', '')
                    
                    if analysis_text:
                        await send_formatted_message(
                            message, 
                            analysis_text, 
                            f"🔍 Анализ страницы '{page_name}'"
                        )
            
            # Отправляем итоговый анализ
            await send_formatted_message(message, summary, "📋 Итоговый анализ")

        except Exception as e:
            logging.error(f"Ошибка при анализе Figma URL: {e}")
            error_text = f"❌ *Произошла ошибка при анализе:*\n\n`{escape_markdown(str(e))}`"
            try:
                await message.reply(error_text, parse_mode=ParseMode.MARKDOWN_V2)
            except Exception:
                await message.reply(f"Произошла ошибка при анализе: {e}")
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
        await bot.download(message.photo[-1], destination=str(photo_path))
        
        # Отправляем обратно изображение с подтверждением
        confirmation_text = "✅ *Получил ваше изображение\\.*\n\nАнализирую\\.\\.\\."
        try:
            await message.answer_photo(
                photo=types.FSInputFile(str(photo_path)),
                caption=confirmation_text,
                parse_mode=ParseMode.MARKDOWN_V2
            )
        except Exception:
            await message.answer_photo(
                photo=types.FSInputFile(str(photo_path)),
                caption="✅ Получил ваше изображение. Анализирую..."
            )
        
        # Загружаем промпт для анализа изображений
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

    except Exception as e:
        logging.error(f"Ошибка при обработке изображения: {e}")
        error_text = f"❌ *Произошла ошибка при обработке изображения:*\n\n`{escape_markdown(str(e))}`"
        try:
            await message.reply(error_text, parse_mode=ParseMode.MARKDOWN_V2)
        except Exception:
            await message.reply(f"Произошла ошибка при обработке изображения: {e}")
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
