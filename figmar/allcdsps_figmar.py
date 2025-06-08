import os
import asyncio
import logging
from pathlib import Path
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import CommandStart

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

# --- Обработчики сообщений ---

@dp.message(CommandStart())
async def send_welcome(message: types.Message):
    """
    Обработчик команды /start. Отправляет приветственное сообщение.
    """
    await message.reply(SYSTEM_PROMPT)

@dp.message(F.text)
async def handle_text(message: types.Message):
    """
    Обрабатывает текстовые сообщения. Если это ссылка на Figma, запускает анализ.
    """
    text = message.text.strip()
    if text.startswith("https://www.figma.com/"):
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
                # Исправляем путь к колонкам - они создаются относительно base_project_dir
                columns_dir = Path(__file__).parent / 'columns_py_opencv_actual_images'
                
                # Отправляем оригинальные изображения страниц
                if images_dir.exists():
                    for image_file in images_dir.glob('*.png'):
                        try:
                            await message.answer_photo(
                                photo=types.FSInputFile(str(image_file)),
                                caption=f"📄 Страница: {image_file.stem.replace('node_', '').replace('_', ':')}"
                            )
                        except Exception as e:
                            logging.warning(f"Не удалось отправить изображение {image_file}: {e}")
                
                # Отправляем разделенные колонки, если они есть
                if columns_dir.exists():
                    for node_dir in columns_dir.iterdir():
                        if node_dir.is_dir():
                            column_files = sorted(node_dir.glob('column_*.png'))
                            if column_files:
                                await message.answer(f"🔧 Разделенные колонки для страницы {node_dir.name}:")
                                for column_file in column_files:
                                    try:
                                        await message.answer_photo(
                                            photo=types.FSInputFile(str(column_file)),
                                            caption=f"📱 {column_file.stem.replace('_', ' ').title()}"
                                        )
                                    except Exception as e:
                                        logging.warning(f"Не удалось отправить колонку {column_file}: {e}")
            
            # Отправляем промежуточные анализы страниц
            if intermediate_analyses:
                await message.answer("📊 Анализ отдельных страниц:")
                for analysis_data in intermediate_analyses:
                    page_name = analysis_data.get('page_name', 'Неизвестная страница')
                    analysis_text = analysis_data.get('analysis', '')
                    
                    if analysis_text:
                        # Добавляем заголовок к анализу
                        full_analysis = f"🔍 Анализ страницы '{page_name}':\n\n{analysis_text}"
                        
                        # Отправляем анализ частями, если он длинный
                        if len(full_analysis) > 4096:
                            for i in range(0, len(full_analysis), 4096):
                                await message.answer(full_analysis[i:i+4096])
                        else:
                            await message.answer(full_analysis)
            
            # Отправляем итоговый анализ
            await message.answer("📋 Итоговый анализ:")
            if len(summary) > 4096:
                for i in range(0, len(summary), 4096):
                    await message.answer(summary[i:i+4096])
            else:
                await message.answer(summary)

        except Exception as e:
            logging.error(f"Ошибка при анализе Figma URL: {e}")
            await message.reply(f"Произошла ошибка при анализе: {e}")
    else:
        await message.reply("Это не похоже на ссылку на Figma. Пожалуйста, отправьте корректную ссылку.")

@dp.message(F.photo)
async def handle_photo(message: types.Message):
    """
    Обрабатывает полученные изображения.
    """
    await message.reply("Получил изображение. Начинаю анализ...")
    
    # Создаем директорию для временных файлов, если ее нет
    temp_dir = Path(__file__).parent / "temp_images"
    temp_dir.mkdir(exist_ok=True)
    
    photo_path = temp_dir / f"{message.photo[-1].file_id}.jpg"
    
    try:
        # Скачиваем файл
        await bot.download(message.photo[-1], destination=str(photo_path))
        
        # Отправляем обратно изображение с подтверждением
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
        if len(analysis_result) > 4096:
            for i in range(0, len(analysis_result), 4096):
                await message.answer(analysis_result[i:i+4096])
        else:
            await message.answer(analysis_result)

    except Exception as e:
        logging.error(f"Ошибка при обработке изображения: {e}")
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
