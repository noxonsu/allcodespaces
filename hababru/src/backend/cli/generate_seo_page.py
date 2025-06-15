import argparse
import os
import sys
import unicodedata
from dotenv import load_dotenv

# Добавляем корневую директорию проекта в sys.path, чтобы импорты работали корректно
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))

# Загрузка переменных окружения
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

from src.backend.services.content_generation_service import ContentGenerationService
from src.backend.services.deepseek_service import DeepSeekService
from src.backend.services.yandex_wordstat_service import YandexWordstatService

def slugify(value):
    """
    Транслитерирует строку в URL-совместимый слаг, включая кириллицу.
    """
    # Простая транслитерация кириллицы
    # Можно использовать более продвинутые библиотеки, но для базовой задачи этого достаточно
    translit_map = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
        'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
        'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
        'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
        'я': 'ya', ' ': '-', '.': '', ',': '', '/': '-', '\\': '-', '(': '', ')': '',
        '[': '', ']': '', '{': '', '}': '', '!': '', '?': '', ':': '', ';': '',
        '\'': '', '"': '', '&': 'and', '+': 'plus', '=': 'equals', '#': '', '@': '',
        '$': '', '%': '', '^': '', '*': '', '~': '', '`': ''
    }
    
    value = str(value).lower()
    slug = ''.join(translit_map.get(char, char) for char in value)
    
    # Удаляем повторяющиеся дефисы и дефисы в начале/конце
    slug = slug.replace('--', '-')
    slug = slug.strip('-')
    
    # Удаляем все, что не является буквой, цифрой или дефисом
    slug = ''.join(c for c in slug if c.isalnum() or c == '-')
    
    return slug

def main():
    parser = argparse.ArgumentParser(description="Генерация SEO-страницы на основе ключевого слова.")
    parser.add_argument("--keyword", required=True, help="Основное ключевое слово для генерации SEO-страницы.")
    
    args = parser.parse_args()
    keyword = args.keyword
    slug = slugify(keyword)
    
    if not slug:
        print(f"Ошибка: Не удалось сгенерировать корректный слаг из ключевого слова '{keyword}'.")
        sys.exit(1)

    # Формируем путь относительно директории скрипта, а затем поднимаемся до hababru
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, '..', '..', '..')) # hababru
    
    seo_pages_base_dir = os.path.join(project_root, 'content', 'seo_pages')
    seo_page_dir = os.path.join(seo_pages_base_dir, slug)

    # Проверяем, существует ли уже директория с таким слагом
    if os.path.exists(seo_page_dir) and os.path.isdir(seo_page_dir):
        print(f"Ошибка: Директория для SEO-страницы с ключом (слагом) '{slug}' уже существует: {seo_page_dir}")
        print("Создание новой страницы отменено, чтобы избежать дублирования.")
        sys.exit(1)
        
    # Создаем директорию, если она не существует
    # Эта проверка на существование здесь больше для полноты, т.к. предыдущий блок должен был бы выйти, если она существует
    if not os.path.exists(seo_page_dir):
        os.makedirs(seo_page_dir)
        print(f"Создана директория для SEO-страницы: {seo_page_dir}")
    # Этот else блок теперь не должен достигаться, если предыдущая логика работает правильно
    # else:
    #     print(f"Директория для SEO-страницы уже существует: {seo_page_dir}. Перезаписываем контент.")


    print(f"Начинаем генерацию контента для ключевого слова: '{keyword}' (слаг: '{slug}')")
    
    # Инициализация сервисов
    deepseek_service = DeepSeekService(api_key=os.getenv('DEEPSEEK_API_KEY'))
    yandex_wordstat_service = YandexWordstatService(
        client_id=os.getenv('YANDEX_CLIENT_ID'),
        client_secret=os.getenv('YANDEX_CLIENT_SECRET'),
        redirect_uri=os.getenv('YANDEX_REDIRECT_URI'),
        oauth_token=os.getenv('YANDEX_OAUTH_TOKEN')
    )

    # Инициализация и вызов сервиса генерации контента
    content_generator = ContentGenerationService(deepseek_service, yandex_wordstat_service)
    content_generator.generate_all_for_keyword(keyword, slug, seo_page_dir)
    
    print(f"Генерация SEO-страницы для '{keyword}' завершена.")
    print(f"Страница будет доступна по URL: /{slug}")

if __name__ == "__main__":
    main()
