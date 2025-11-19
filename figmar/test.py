import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
import requests
import json
from typing import List, Dict, Any, Set
import sys # Добавляем импорт sys

# Добавляем корневую директорию проекта в sys.path для абсолютных импортов
sys.path.append(str(Path(__file__).parent.parent))

# Импортируем нужные функции из figma_analyzer
# from figma_analyzer import ensure_dir_exists # Эта функция не используется напрямую здесь, но может быть в analyzer.py

# Загружаем переменные окружения
dotenv_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=dotenv_path)

FIGMA_API_KEY = os.getenv('FIGMA_API_KEY')
print(f"Загружены переменные из {dotenv_path.resolve()}:")
print(f"FIGMA_API_KEY: {'...' + FIGMA_API_KEY[-4:] if FIGMA_API_KEY else 'Not set'}")

def collect_image_refs(node: Dict[str, Any], image_refs: Set[str]):
    """Рекурсивно обходит дерево узлов и собирает все imageRef из заливок."""
    if "fills" in node and isinstance(node["fills"], list):
        for fill in node["fills"]:
            if fill.get("type") == "IMAGE" and "imageRef" in fill:
                image_refs.add(fill["imageRef"])

    if "children" in node and isinstance(node["children"], list):
        for child in node["children"]:
            collect_image_refs(child, image_refs)

async def process_figma_file(figma_url: str):
    """
    Получает данные из Figma, извлекает структуру, стили, изображения-ассеты,
    и сохраняет все в единую структуру для последующей верстки.
    """
    try:
        file_key = figma_url.split('/')[4]
    except IndexError:
        raise ValueError("Неверный URL Figma. Не удалось извлечь file_key.")

    if not FIGMA_API_KEY:
        raise ValueError("FIGMA_API_KEY не задан в окружении")
    headers = {"X-Figma-Token": FIGMA_API_KEY}

    # 1. Получаем основные данные файла
    print(f"Запрос данных для файла: {file_key}")
    file_resp = requests.get(f"https://api.figma.com/v1/files/{file_key}", headers=headers)
    file_resp.raise_for_status()
    file_data = file_resp.json()
    print("Данные из Figma API получены.")

    from figmar.figma_lib.analyzer import fetch_all_data_and_analyze_figma
    
    result = await fetch_all_data_and_analyze_figma(figma_url)
    
    # Получаем пути к файлам из результата
    summary_file_path = result.get("summaryFilePath")
    intermediate_analyses = result.get("intermediateAnalyses", [])
    data_path = result.get("dataPath")
    
    if summary_file_path:
        print(f"\nОбработка завершена. Итоговый анализ сохранен в: {summary_file_path}")
        with open(summary_file_path, 'r', encoding='utf-8') as f:
            print("\n--- Содержимое итогового анализа ---")
            print(f.read())
    else:
        print("\nОбработка завершилась с ошибками.")

    if data_path:
        final_prompt_file_path = Path(data_path) / 'final_analysis_prompt.txt'
        if final_prompt_file_path.exists():
            with open(final_prompt_file_path, 'r', encoding='utf-8') as f:
                print("\n--- Содержимое финального промпта для LLM ---")
                print(f.read())
        else:
            print(f"\nФайл финального промпта не найден: {final_prompt_file_path}")

    if intermediate_analyses:
        print("\n--- Промежуточные анализы колонок ---")
        for i, analysis_data in enumerate(intermediate_analyses):
            page_name = analysis_data.get('page_name', 'Неизвестная страница')
            analysis_text = analysis_data.get('analysis', '')
            image_path_col = analysis_data.get('image_path_col', 'N/A')
            print(f"\n--- Анализ колонки {i+1} (Страница: '{page_name}', Изображение: {image_path_col}) ---")
            print(analysis_text)
    else:
        print("\n--- Промежуточные анализы колонок не найдены ---")

    return summary_file_path # Возвращаем путь к summary файлу для демонстрации

async def main():
    """
    Тестовый запуск анализатора с захардкоженным URL.
    """
    test_figma_url = "https://www.figma.com/design/4BL6aRRqpgas2vz6tgj17M/Untitled--3-?node-id=0-1&t=KzTuYppbDUnOXdHB-2" # Измененный URL для нового кэша

    print("\n--- Запуск полного анализа Figma (JSON + Images) ---")
    print(f"URL: {test_figma_url}")
    print("Это может занять несколько минут...")

    try:
        output_file_path = await process_figma_file(test_figma_url)
        if output_file_path:
            print(f"\nТестовый запуск завершен. Результаты выше.")
        else:
            print("\nТестовый запуск завершился с ошибками.")

    except ValueError as ve:
        print(f"\nОшибка значения: {ve}")
        print("Проверьте правильность URL и наличие API ключей в .env файле.")
    except Exception as e:
        print(f"\nПроизошла непредвиденная ошибка: {e}")


if __name__ == "__main__":
    asyncio.run(main())
