import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
import requests
import json
from typing import List, Dict, Any, Set

# Импортируем нужные функции из figma_analyzer
from figma_analyzer import ensure_dir_exists

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

    # 2. Собираем все imageRef из документа
    image_refs = set()
    collect_image_refs(file_data["document"], image_refs)
    print(f"Найдено уникальных изображений (imageRef): {len(image_refs)}")

    # 3. Получаем URL для скачивания всех найденных изображений
    image_urls = {}
    if image_refs:
        print("Запрос URL для скачивания изображений...")
        images_resp = requests.get(f"https://api.figma.com/v1/files/{file_key}/images", headers=headers)
        images_resp.raise_for_status()
        image_urls = images_resp.json().get("meta", {}).get("images", {})
        print(f"Получено URL для {len(image_urls)} изображений.")

    # --- Подготовка директорий ---
    base_export_dir = Path(__file__).parent / "figma_data_exports"
    file_export_dir = base_export_dir / file_key
    assets_dir = file_export_dir / "assets"
    ensure_dir_exists(assets_dir)

    # 4. Скачиваем и сохраняем изображения
    saved_asset_paths = {}
    for ref, url in image_urls.items():
        if ref in image_refs:
            try:
                image_resp = requests.get(url, stream=True)
                image_resp.raise_for_status()
                # Определяем расширение файла из URL или используем .png по умолчанию
                file_extension = Path(url.split('?')[0]).suffix or '.png'
                asset_path = assets_dir / f"{ref.replace(':', '_')}{file_extension}"
                with open(asset_path, 'wb') as f:
                    for chunk in image_resp.iter_content(chunk_size=8192):
                        f.write(chunk)
                saved_asset_paths[ref] = str(asset_path.relative_to(Path(__file__).parent))
                print(f"Сохранено: {asset_path}")
            except requests.exceptions.RequestException as e:
                print(f"Ошибка скачивания изображения {ref}: {e}")

    # 5. Строим обогащенное дерево JSON
    styles_lookup = file_data.get("styles", {})

    def build_node_tree(node: Dict[str, Any]) -> Dict[str, Any]:
        node_data = {
            "id": node.get("id"),
            "name": node.get("name"),
            "type": node.get("type"),
        }
        if node.get("type") == "TEXT":
            node_data["characters"] = node.get("characters")
        
        if "styles" in node:
            node_data["applied_styles"] = {
                style_type: styles_lookup.get(style_id, {"name": "Not Found"})
                for style_type, style_id in node["styles"].items()
            }

        if "fills" in node and isinstance(node["fills"], list):
            image_fills = []
            for fill in node["fills"]:
                if fill.get("type") == "IMAGE" and fill.get("imageRef") in saved_asset_paths:
                    image_fills.append({
                        "type": "IMAGE",
                        "imageRef": fill["imageRef"],
                        "asset_path": saved_asset_paths[fill["imageRef"]]
                    })
            if image_fills:
                node_data["image_fills"] = image_fills

        if "children" in node and isinstance(node["children"], list):
            node_data["children"] = [build_node_tree(child) for child in node["children"]]
        
        return node_data

    print("\nПостроение итоговой структуры JSON...")
    final_data = build_node_tree(file_data["document"])
    
    # Сохраняем итоговый JSON
    output_path = file_export_dir / "layout_with_assets.json"
    print(f"Сохранение итоговых данных в: {output_path}")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(final_data, f, ensure_ascii=False, indent=2)
    
    print("Итоговый JSON успешно сохранен.")
    return str(output_path)

async def main():
    """
    Тестовый запуск анализатора с захардкоженным URL.
    """
    test_figma_url = "https://www.figma.com/design/XikMzTgQEhpCAhZpi02UBl/%D0%90%D1%8D%D1%80%D0%BE%D0%BA%D0%BB%D1%83%D0%B1--Copy---Copy-?node-id=165-1919&p=f&t=adRTTeKZH7YEaDmV-0"

    print("\n--- Запуск полного анализа Figma (JSON + Assets) ---")
    print(f"URL: {test_figma_url}")
    print("Это может занять несколько минут...")

    try:
        output_file = await process_figma_file(test_figma_url)
        if output_file:
            print(f"\nОбработка завершена. Итоговый JSON с путями к ассетам сохранен в: {output_file}")
        else:
            print("\nОбработка завершилась с ошибками.")

    except ValueError as ve:
        print(f"\nОшибка значения: {ve}")
        print("Проверьте правильность URL и наличие API ключей в .env файле.")
    except Exception as e:
        print(f"\nПроизошла непредвиденная ошибка: {e}")


if __name__ == "__main__":
    asyncio.run(main())


async def main():
    """
    Тестовый запуск анализатора с захардкоженным URL.
    """
    test_figma_url = "https://www.figma.com/design/XikMzTgQEhpCAhZpi02UBl/%D0%90%D1%8D%D1%80%D0%BE%D0%BA%D0%BB%D1%83%D0%B1--Copy---Copy-?node-id=165-1919&p=f&t=adRTTeKZH7YEaDmV-0"

    print("\n--- Запуск полного анализа Figma (JSON + Images) ---")
    print(f"URL: {test_figma_url}")
    print("Это может занять несколько минут...")

    try:
        output_directory = await process_figma_file(test_figma_url)
        if output_directory:
            print(f"\nОбработка завершена. Все данные сохранены в директории: {output_directory}")
        else:
            print("\nОбработка завершилась с ошибками.")

    except ValueError as ve:
        print(f"\nОшибка значения: {ve}")
        print("Проверьте правильность URL и наличие API ключей в .env файле.")
    except Exception as e:
        print(f"\nПроизошла непредвиденная ошибка: {e}")


if __name__ == "__main__":
    asyncio.run(main())
