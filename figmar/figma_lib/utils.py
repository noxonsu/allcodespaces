import re
import logging
from pathlib import Path
import asyncio
from PIL import Image
from aiogram import types
from aiogram.enums import ParseMode

# Максимальные размеры изображения для Telegram (по большей стороне)
MAX_TELEGRAM_IMAGE_DIMENSION = 1280
MAX_TELEGRAM_IMAGE_SIZE_BYTES = 10 * 1024 * 1024 # 10 MB

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

async def send_image_safely(message: types.Message, image_path, caption=""):
    """
    Безопасно отправляет изображение, обрабатывая ошибки и изменяя размер при необходимости.
    """
    original_image_path = Path(image_path)
    
    if not original_image_path.exists():
        logging.warning(f"Файл изображения не найден: {original_image_path}")
        return False
    
    image_to_send_path = original_image_path
    
    # Проверяем размер файла и размеры изображения
    file_size = original_image_path.stat().st_size
    
    try:
        with Image.open(original_image_path) as img:
            width, height = img.size
            
            needs_resize = False
            if file_size > MAX_TELEGRAM_IMAGE_SIZE_BYTES:
                needs_resize = True
                logging.warning(f"Изображение {original_image_path} слишком большое ({file_size / (1024*1024):.2f}MB). Попытка уменьшить размер.")
            
            if max(width, height) > MAX_TELEGRAM_IMAGE_DIMENSION:
                needs_resize = True
                logging.warning(f"Изображение {original_image_path} имеет слишком большие размеры ({width}x{height}). Попытка уменьшить размер.")

            if needs_resize:
                # Вычисляем новые размеры, сохраняя пропорции
                if width > height:
                    new_width = MAX_TELEGRAM_IMAGE_DIMENSION
                    new_height = int(height * (new_width / width))
                else:
                    new_height = MAX_TELEGRAM_IMAGE_DIMENSION
                    new_width = int(width * (new_height / height))
                
                img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
                
                # Сохраняем уменьшенное изображение во временный файл
                temp_dir = Path(__file__).parent / "temp_images"
                temp_dir.mkdir(exist_ok=True)
                resized_image_path = temp_dir / f"resized_{original_image_path.name}"
                img.save(resized_image_path, optimize=True, quality=85) # Оптимизация качества
                
                logging.info(f"Изображение {original_image_path} уменьшено до {new_width}x{new_height} и сохранено как {resized_image_path}")
                image_to_send_path = resized_image_path
            
    except Exception as e:
        logging.error(f"Ошибка при проверке/изменении размера изображения {original_image_path}: {e}. Отправка оригинального файла.")
        image_to_send_path = original_image_path # В случае ошибки, пытаемся отправить оригинал

    try:
        # Проверяем, что изображение валидно после всех манипуляций
        with Image.open(image_to_send_path) as img:
            width, height = img.size
            if width < 1 or height < 1:
                logging.warning(f"Изображение {image_to_send_path} имеет недопустимые размеры (0x0).")
                return False

        await message.answer_photo(
            photo=types.FSInputFile(str(image_to_send_path)),
            caption=caption,
            parse_mode=ParseMode.MARKDOWN_V2
        )
        return True
    except Exception as e:
        logging.warning(f"Не удалось отправить изображение {image_to_send_path}: {e}")
        # Попробуем отправить без форматирования
        try:
            await message.answer_photo(
                photo=types.FSInputFile(str(image_to_send_path)),
                caption=caption.replace('*', '').replace('`', '').replace('_', '').replace('\\', '')
            )
            return True
        except Exception as e2:
            logging.error(f"Полностью не удалось отправить изображение {image_to_send_path}: {e2}")
            return False
    finally:
        # Удаляем временный файл, если он был создан
        if 'resized_image_path' in locals() and resized_image_path.exists():
            try:
                resized_image_path.unlink()
                logging.info(f"Временный файл {resized_image_path} удален.")
            except Exception as e:
                logging.warning(f"Не удалось удалить временный файл {resized_image_path}: {e}")
