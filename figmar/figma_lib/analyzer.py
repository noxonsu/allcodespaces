import os
import json
import requests
from pathlib import Path
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional, Union
import base64
import mimetypes # Для определения типа изображения по data URI
import asyncio # Для asyncio.sleep

# Импортируем функцию из split_image.py
from .split_image import split_image_intellectually

# Импортируем утилиты из figmar_lib.utils
from .utils import escape_markdown, format_analysis_markdown, send_image_safely, send_formatted_message
# from aiogram import types # types нужен для сигнатуры fetch_all_data_and_analyze_figma


# --- Константы ---
COLUMN_WIDTH_THRESHOLD = 2000  # px, как в JS версии

# --- Загрузка переменных окружения ---
# Загружаем .env из родительской директории (figmar/)
load_dotenv(dotenv_path=Path(__file__).parent.parent / '.env')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
FIGMA_API_KEY = os.getenv('FIGMA_API_KEY')
OPENAIMODEL_FIGMA_ANALYSIS = os.getenv('OPENAIMODEL_FIGMA_ANALYSIS', 'gpt-4o')

def load_prompt_from_file(file_name: str) -> str:
    """Загружает текст промпта из файла."""
    prompt_path = Path(__file__).parent / file_name
    if not prompt_path.exists():
        print(f"Файл промпта не найден: {prompt_path}")
        return ""
    try:
        with open(prompt_path, 'r', encoding='utf-8') as f:
            content = f.read().strip()
            if content:
                print(f"Успешно загружен промпт из файла: {file_name} ({len(content)} символов)")
            else:
                print(f"Файл промпта пустой: {file_name}")
            return content
    except Exception as e:
        print(f"Ошибка при чтении файла промпта {prompt_path}: {e}")
        return ""

IMAGE_ANALYSE_PROMPT_TEMPLATE = load_prompt_from_file('.env.image_analyse_prompt')
FINAL_ANALYSE_PROMPT_TEMPLATE = load_prompt_from_file('.env.final_analyse_prompt')


# --- Утилиты для работы с файловой системой ---
def ensure_dir_exists(dir_path: Union[str, Path]):
    """Гарантирует существование директории."""
    path = Path(dir_path)
    if not path.exists():
        path.mkdir(parents=True, exist_ok=True)
        print(f"Директория создана: {path}")

def save_data_to_file(file_path: Union[str, Path], data: Any, is_json: bool = True):
    """Сохраняет данные в файл."""
    path = Path(file_path)
    try:
        ensure_dir_exists(path.parent)
        with open(path, 'w', encoding='utf-8') if is_json or isinstance(data, str) else open(path, 'wb') as f:
            if is_json:
                json.dump(data, f, indent=2, ensure_ascii=False)
            else:
                f.write(data)
        print(f"Данные сохранены в файл: {path}")
    except Exception as e:
        print(f"Ошибка при сохранении данных в файл {path}: {e}")


# --- Функции для работы с Figma API ---
def make_figma_api_request(url: str, file_id: str, endpoint_name: str) -> Optional[Dict[str, Any]]:
    """Выполняет запрос к Figma API."""
    if not FIGMA_API_KEY:
        error_msg = 'Figma API key не найден. Установите переменную окружения FIGMA_API_KEY.'
        print(error_msg)
        raise ValueError(error_msg)

    print(f"Запрос к Figma API: {endpoint_name} для fileId: {file_id}")
    headers = {'X-Figma-Token': FIGMA_API_KEY}
    try:
        response = requests.get(url, headers=headers, timeout=60)
        response.raise_for_status()  # Вызовет HTTPError для плохих статусов (4xx или 5xx)
        return response.json()
    except requests.exceptions.HTTPError as http_err:
        print(f"Ошибка при запросе {endpoint_name} к Figma API ({response.status_code} {response.reason}): {response.text}")
        raise ValueError(f"Ошибка API {endpoint_name}: {response.status_code} {response.reason}. Details: {response.text}") from http_err
    except requests.exceptions.RequestException as req_err:
        print(f"Критическая ошибка при запросе {endpoint_name} для fileId {file_id}: {req_err}")
        raise ValueError(f"Критическая ошибка при запросе {endpoint_name}: {req_err}") from req_err

async def get_figma_file(file_id: str, base_dir: Path) -> Optional[Dict[str, Any]]:
    """Получает информацию о файле Figma."""
    url = f"https://api.figma.com/v1/files/{file_id}"
    data = make_figma_api_request(url, file_id, "getFigmaFile")
    if data:
        save_data_to_file(base_dir / 'file_info.json', data)
    return data

async def get_figma_node_images(file_id: str, node_ids: List[str], base_dir: Path) -> Optional[Dict[str, str]]:
    """Получает изображения для указанных узлов Figma."""
    if not node_ids:
        print("Нет nodeIds для запроса изображений.")
        return None

    ids_query_param = ','.join(node_ids)
    url = f"https://api.figma.com/v1/images/{file_id}?ids={ids_query_param}&format=png"
    
    data = make_figma_api_request(url, file_id, "getFigmaNodeImages")

    if data and data.get('images'):
        images_dir = base_dir / 'images'
        ensure_dir_exists(images_dir)
        downloaded_count = 0
        image_urls_map = {} # Сохраняем URL-ы для возврата

        for node_id, image_url in data['images'].items():
            if image_url:
                image_path = images_dir / f"node_{node_id.replace(':', '_')}.png"
                try:
                    image_response = requests.get(image_url, timeout=60)
                    image_response.raise_for_status()
                    
                    save_data_to_file(image_path, image_response.content, is_json=False)
                    image_urls_map[node_id] = str(image_path.resolve()) # Сохраняем локальный путь
                    downloaded_count += 1
                except requests.exceptions.RequestException as e:
                    print(f"Ошибка при скачивании или сохранении изображения для узла {node_id}: {e}")
                except Exception as e:
                    print(f"Непредвиденная ошибка при обработке изображения для узла {node_id}: {e}")
            else:
                image_urls_map[node_id] = None # Если URL пустой

        print(f"Скачано новых изображений: {downloaded_count}")
        # Возвращаем карту node_id к ЛОКАЛЬНОМУ ПУТИ к файлу или None
        return {node_id: str(images_dir / f"node_{node_id.replace(':', '_')}.png") if data['images'].get(node_id) else None 
                for node_id in data['images']}
    else:
        print("Не удалось получить изображения узлов или ответ не содержит data.images.")
    return None

async def get_figma_comments(file_id: str, base_dir: Path) -> Optional[Dict[str, Any]]:
    """Получает комментарии к файлу Figma."""
    url = f"https://api.figma.com/v1/files/{file_id}/comments"
    data = make_figma_api_request(url, file_id, "getFigmaComments")
    if data and data.get('comments'):
        save_data_to_file(base_dir / 'comments.json', data)
    else:
        print("Комментарии не найдены или произошла ошибка при их получении.")
        save_data_to_file(base_dir / 'comments.json', {"comments": []})
    return data

async def download_image_fills(file_id: str, base_dir: Path) -> Dict[str, str]:
    """
    Скачивает изображения, используемые в заливках (image fills), и сохраняет их.
    Возвращает словарь с imageRef: локальный_путь.
    """
    print(f"\n--- Скачивание изображений-заливок для fileId: {file_id} ---")
    image_fills_dir = base_dir / 'image_fills'
    ensure_dir_exists(image_fills_dir)

    # 1. Получаем все imageRef из файла
    # file_info уже должен быть получен в fetch_all_data_and_analyze_figma
    # Если его нет, то нужно получить его здесь, но это дублирование
    # Лучше передать file_info как аргумент
    
    # Для простоты, пока будем получать file_info здесь, если его нет
    file_info_for_refs = None
    try:
        file_info_for_refs = make_figma_api_request(f"https://api.figma.com/v1/files/{file_id}", file_id, "getFigmaFileForImageRefs")
    except Exception as e:
        print(f"Ошибка при получении file_info для imageRef: {e}")
        return {}

    image_refs = set()
    if file_info_for_refs and file_info_for_refs.get('document'):
        def collect_refs_recursive(node: Dict[str, Any]):
            if "fills" in node and isinstance(node["fills"], list):
                for fill in node["fills"]:
                    if fill.get("type") == "IMAGE" and "imageRef" in fill:
                        image_refs.add(fill["imageRef"])
            if "children" in node and isinstance(node["children"], list):
                for child in node["children"]:
                    collect_refs_recursive(child)
        collect_refs_recursive(file_info_for_refs['document'])
    
    print(f"Найдено уникальных imageRef: {len(image_refs)}")

    if not image_refs:
        print("Нет imageRef для скачивания.")
        return {}

    # 2. Получаем URL для скачивания всех найденных изображений
    image_urls_map = {}
    try:
        url = f"https://api.figma.com/v1/files/{file_id}/images"
        data = make_figma_api_request(url, file_id, "getImageFills")
        if data and data.get('meta') and data['meta'].get('images'):
            image_urls_map = data['meta']['images']
            print(f"Получено URL для {len(image_urls_map)} imageRef.")
        else:
            print("Не удалось получить URL изображений-заливок или ответ не содержит data.meta.images.")
    except Exception as e:
        print(f"Ошибка при запросе URL изображений-заливок: {e}")
        return {}

    # 3. Скачиваем и сохраняем изображения
    saved_image_fill_paths = {}
    for ref, url in image_urls_map.items():
        if url:
            try:
                image_resp = requests.get(url, timeout=60)
                image_resp.raise_for_status()
                file_extension = Path(url.split('?')[0]).suffix or '.png'
                asset_path = image_fills_dir / f"{ref.replace(':', '_')}{file_extension}"
                save_data_to_file(asset_path, image_resp.content, is_json=False)
                saved_image_fill_paths[ref] = str(asset_path.resolve())
                print(f"Сохранено изображение-заливка: {asset_path}")
            except requests.exceptions.RequestException as e:
                print(f"Ошибка скачивания изображения-заливки {ref} ({url}): {e}")
            except Exception as e:
                print(f"Непредвиденная ошибка при обработке изображения-заливки {ref}: {e}")
        else:
            print(f"URL для imageRef {ref} отсутствует, пропускаем скачивание.")
    
    print(f"Скачано {len(saved_image_fill_paths)} изображений-заливок.")
    return saved_image_fill_paths


# --- Функция для вызова OpenAI API ---
def _call_openai_for_figma_analysis(prompt_text: str, image_path: Optional[str] = None, max_tokens: int = 16384) -> str:
    """Выполняет вызов OpenAI API для анализа Figma."""
    if not OPENAI_API_KEY:
        print("Ключ OpenAI API не настроен!")
        raise ValueError("Ключ OpenAI API не настроен.")

    model_name = OPENAIMODEL_FIGMA_ANALYSIS
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}"
    }
    
    messages = [
        {"role": "system", "content": "You are an expert Figma analyzer. Your task is to analyze Figma designs based on provided information and images. Provide detailed and structured responses in Russian."},
    ]
    
    user_message_content = [{"type": "text", "text": prompt_text}]

    if image_path:
        try:
            # Определяем, является ли image_path URL-ом или локальным путем
            if image_path.startswith('http://') or image_path.startswith('https://'):
                user_message_content.append({
                    "type": "image_url",
                    "image_url": {"url": image_path, "detail": "high"}
                })
            elif Path(image_path).exists(): # Локальный файл
                with open(image_path, "rb") as image_file:
                    base64_image = base64.b64encode(image_file.read()).decode('utf-8')
                
                # Определяем mime type
                mime_type, _ = mimetypes.guess_type(image_path)
                if not mime_type: # Если не удалось определить, используем стандартный
                    mime_type = "image/png" if image_path.lower().endswith(".png") else "image/jpeg"
                
                user_message_content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime_type};base64,{base64_image}", "detail": "high"}
                })
            else: # Если это data URI
                 user_message_content.append({
                    "type": "image_url",
                    "image_url": {"url": image_path, "detail": "high"}
                })
        except Exception as e:
            print(f"Ошибка при обработке URL изображения {image_path}: {e}")
            # Не добавляем изображение, если есть ошибка

    messages.append({"role": "user", "content": user_message_content})

    payload = {
        "model": model_name,
        "messages": messages,
        "max_tokens": max_tokens,
    }

    print(f"[FigmaLLM] Отправка запроса в OpenAI. Модель: {model_name}. Max Tokens: {max_tokens}. Image: {'Provided' if image_path else 'Not provided'}")
    
    try:
        response = requests.post('https://api.openai.com/v1/chat/completions', headers=headers, json=payload, timeout=180)
        response.raise_for_status()
        response_data = response.json()
        
        assistant_text = response_data.get('choices', [{}])[0].get('message', {}).get('content')

        if assistant_text is None:
            print(f"[FigmaLLM] Ответ от OpenAI не содержит текстового контента. Full response: {response_data}")
            raise ValueError('Ответ от OpenAI не содержит текстового контента.')
        
        usage = response_data.get('usage', {})
        input_tokens = usage.get('prompt_tokens', 0)
        output_tokens = usage.get('completion_tokens', 0)
        print(f"[FigmaLLM] Tokens used: Input: {input_tokens}, Output: {output_tokens}")

        return assistant_text.strip()
    except requests.exceptions.HTTPError as e:
        error_body = e.response.text
        print(f"[FigmaLLM] Ошибка API OpenAI ({e.response.status_code}): {error_body}")
        raise ValueError(f"Ошибка API OpenAI: {e.response.status_code}. Body: {error_body}") from e
    except requests.exceptions.RequestException as e:
        print(f"[FigmaLLM] Ошибка вызова OpenAI API: {e}")
        raise ValueError(f"Ошибка при обработке запроса LLM: {e}") from e
    except (IndexError, KeyError) as e:
        print(f"[FigmaLLM] Ошибка парсинга ответа OpenAI: {e}. Response data: {response_data if 'response_data' in locals() else 'N/A'}")
        raise ValueError(f"Ошибка парсинга ответа OpenAI: {e}") from e


# --- Функция для анализа данных с помощью LLM ---
async def analyze_figma_data_with_llm(text_content: str, image_path: Optional[str] = None, max_tokens: int = 16384) -> str:
    """Анализирует данные Figma с помощью LLM."""
    if not OPENAI_API_KEY:
        print('OPENAI_API_KEY для LLM не найден, пропускаем анализ Figma через AI')
        return "OpenAI анализ недоступен - нет API ключа."
    
    print(f"\nЗапрос к LLM для Figma анализа (max_tokens: {max_tokens}). Image Path: {image_path if image_path else 'Not provided'}")
    
    try:
        # Используем синхронный вызов внутри async функции, т.к. requests синхронный
        # В реальном приложении лучше использовать aiohttp для асинхронных HTTP запросов
        llm_response = _call_openai_for_figma_analysis(text_content, image_path, max_tokens)
        print("Ответ от LLM для Figma анализа получен.")
        return llm_response
    except Exception as e:
        print(f"Ошибка при анализе Figma через LLM: {e}")
        return f"Ошибка анализа Figma через LLM: {e}"

# --- Основная функция анализа Figma ---
async def fetch_all_data_and_analyze_figma(figma_url: str) -> Dict[str, Any]:
    """
    Основная функция для сбора данных из Figma и их анализа с помощью LLM.
    """
    print(f"Начинаю анализ Figma URL: {figma_url}")
    
    try:
        url_parts = figma_url.split('/')
        file_id_index = url_parts.index('file') + 1 if 'file' in url_parts else url_parts.index('design') + 1
        file_id = url_parts[file_id_index]
    except (ValueError, IndexError):
        error_msg = f"Не удалось извлечь fileId из URL: {figma_url}"
        print(error_msg)
        raise ValueError(error_msg)

    print(f"Работаем с fileId: {file_id}")
    
    # Используем Path.cwd() для получения текущей рабочей директории, если скрипт запускается из корня проекта
    # или Path(__file__).parent если структура проекта подразумевает запуск из директории figmar/
    base_project_dir = Path(__file__).parent.parent # Теперь это директория figmar/
    base_dir = base_project_dir / 'figma_data' / file_id.replace(r'[^a-zA-Z0-9-_]', '_')
    ensure_dir_exists(base_dir)
    print(f"Данные будут сохранены в: {base_dir}")

    analysis_prompt_parts = [f"Проанализируй следующие данные из файла (ID: {file_id}) для оценки его сложности. Обрати внимание на количество страниц, узлов, компонентов, стилей, комментариев и общую структуру.\n\n"]
    
    file_info = None
    node_images_paths = None # Будет содержать пути к локальным файлам изображений
    page_id_to_name_map = {}
    intermediate_analyses = [] # Для сбора промежуточных анализов
    
    # 1. Получение информации о файле
    try:
        print("\n--- Получение информации о файле ---")
        file_info = await get_figma_file(file_id, base_dir)
        if file_info and file_info.get('document'):
            analysis_prompt_parts.append("Информация о файле:\n")
            analysis_prompt_parts.append(f"  Имя: {file_info.get('name')}\n")
            analysis_prompt_parts.append(f"  Последнее изменение: {file_info.get('lastModified')}\n")
            
            pages = file_info['document'].get('children', [])
            analysis_prompt_parts.append(f"  Количество страниц (canvas): {len(pages)}\n")

            image_fills_paths = {} # Инициализируем пустым словарем
            if DOWNLOAD_IMAGE_FILLS: # Условное скачивание
                print("Флаг DOWNLOAD_IMAGE_FILLS установлен в True. Скачиваю изображения-заливки.")
                image_fills_paths = await download_image_fills(file_id, base_dir)
            else:
                print("Флаг DOWNLOAD_IMAGE_FILLS установлен в False. Пропускаю скачивание изображений-заливок.")
            analysis_prompt_parts.append(f"  Скачано изображений-заливок (image fills): {len(image_fills_paths)}\n")

            node_ids_to_fetch_images = []
            if pages:
                for page in pages:
                    if page.get('id') and page.get('name'):
                        node_ids_to_fetch_images.append(page['id'])
                        page_id_to_name_map[page['id']] = page['name']
            
            # 2. Получение изображений страниц
            if node_ids_to_fetch_images:
                print(f"\n--- Получение изображений для {len(node_ids_to_fetch_images)} узлов (страниц) ---")
                node_images_paths = await get_figma_node_images(file_id, node_ids_to_fetch_images, base_dir)
                
                if node_images_paths:
                    valid_image_paths_count = sum(1 for path in node_images_paths.values() if path)
                    analysis_prompt_parts.append(f"  Получено изображений для страниц: {valid_image_paths_count} (из {len(node_ids_to_fetch_images)} запрошенных)\n")
                    analysis_prompt_parts.append("\nДетальный анализ изображений страниц:\n")

                    for node_id, local_image_path in node_images_paths.items():
                        if not local_image_path: # Если изображение не было скачано
                            print(f"Изображение для узла {node_id} не было скачано, пропускаем анализ.")
                            analysis_prompt_parts.append(f"\nАнализ страницы '{page_id_to_name_map.get(node_id, node_id)}' (ID: {node_id}): Изображение не доступно.\n")
                            continue

                        page_name = page_id_to_name_map.get(node_id, node_id)
                        page_analysis_file_name = f"page_analysis_{node_id.replace(':', '_')}.txt"
                        page_analysis_file_path = base_dir / page_analysis_file_name
                        
                        # Проверяем, есть ли уже готовый анализ на диске
                        if page_analysis_file_path.exists():
                            print(f"Найден существующий анализ для страницы '{page_name}', загружаем из файла: {page_analysis_file_name}")
                            try:
                                with open(page_analysis_file_path, 'r', encoding='utf-8') as f:
                                    existing_analysis = f.read().strip()
                                if existing_analysis:
                                    analysis_prompt_parts.append(f"\nАнализ страницы '{page_name}' (ID: {node_id}):\n{existing_analysis}\n")
                                    intermediate_analyses.append({
                                        'page_name': page_name,
                                        'node_id': node_id,
                                        'analysis': existing_analysis,
                                        'image_path': local_image_path
                                    })
                                    continue
                                else:
                                    print(f"Файл анализа пустой, выполняем новый анализ.")
                            except Exception as e:
                                print(f"Ошибка при чтении существующего анализа: {e}. Выполняем новый анализ.")
                        
                        print(f"\n--- Анализ изображения для страницы '{page_name}' (ID: {node_id}) ---")
                        print(f"Используется локальный файл: {local_image_path}")

                        page_node = next((p for p in pages if p.get('id') == node_id), None)
                        actual_page_width = 0
                        
                        # Попытаемся получить ширину страницы из разных источников
                        if page_node:
                            # Метод 1: absoluteBoundingBox
                            if page_node.get('absoluteBoundingBox') and page_node['absoluteBoundingBox'].get('width', 0) > 0:
                                actual_page_width = page_node['absoluteBoundingBox']['width']
                                print(f"Ширина страницы из absoluteBoundingBox: {actual_page_width}px")
                            
                            # Метод 2: если absoluteBoundingBox недоступен, попробуем из children
                            elif not actual_page_width and page_node.get('children'):
                                max_right = 0
                                min_left = float('inf')
                                for child in page_node['children']:
                                    if child.get('absoluteBoundingBox'):
                                        child_bbox = child['absoluteBoundingBox']
                                        child_left = child_bbox.get('x', 0)
                                        child_width = child_bbox.get('width', 0)
                                        child_right = child_left + child_width
                                        max_right = max(max_right, child_right)
                                        min_left = min(min_left, child_left)
                                
                                if max_right > 0 and min_left != float('inf'):
                                    actual_page_width = max_right - min_left
                                    print(f"Ширина страницы вычислена из дочерних элементов: {actual_page_width}px (от {min_left} до {max_right})")
                            
                            # Метод 3: попробуем использовать размеры canvas/viewport
                            if not actual_page_width and page_node.get('prototypeDevice'):
                                device = page_node['prototypeDevice']
                                if device.get('size') and device['size'].get('width'):
                                    actual_page_width = device['size']['width']
                                    print(f"Ширина страницы из prototypeDevice: {actual_page_width}px")
                        
                        # Если все методы не сработали, используем значение по умолчанию
                        if actual_page_width <= 0:
                            actual_page_width = 1920  # Стандартная ширина для desktop
                            print(f"Не удалось определить ширину страницы, используем значение по умолчанию: {actual_page_width}px")

                        # Формируем базовый промпт для анализа страницы
                        current_page_analysis_prompt = IMAGE_ANALYSE_PROMPT_TEMPLATE
                        current_page_analysis_prompt = current_page_analysis_prompt.replace("{{PAGE_NAME}}", page_name)
                        current_page_analysis_prompt = current_page_analysis_prompt.replace("{{NODE_ID}}", node_id)
                        current_page_analysis_prompt = current_page_analysis_prompt.replace("{{ACTUAL_PAGE_WIDTH}}", str(actual_page_width))

                        page_image_analysis_response_parts = []

                        if actual_page_width > COLUMN_WIDTH_THRESHOLD:
                            print(f"Страница '{page_name}' (ширина: {actual_page_width}px) определена как широкая.")
                            
                            # Запрос к LLM №1: есть ли колонки?
                            is_multi_column_prompt = (
                                f"Проанализируй это изображение страницы '{page_name}' (ID: {node_id}). "
                                f"Ширина холста: {actual_page_width}px. "
                                "Это изображение ОЧЕНЬ ШИРОКОЕ. Вероятно, оно содержит НЕСКОЛЬКО отдельных экранов/макетов, "
                                "расположенных В КОЛОНКАХ (горизонтально рядом друг с другом). "
                                "Содержит ли это изображение несколько таких колонок? Ответь только 'да' или 'нет'."
                            )
                            is_multi_column_response = await analyze_figma_data_with_llm(is_multi_column_prompt, local_image_path, max_tokens=50)
                            print(f"LLM ответ на вопрос о наличии колонок: '{is_multi_column_response}'")

                            if 'да' in is_multi_column_response.lower():
                                # Запрос к LLM №2: сколько колонок?
                                count_columns_prompt = (
                                    f"Изображение страницы '{page_name}' (ID: {node_id}) содержит несколько колонок. "
                                    "Сколько отдельных вертикальных колонок (экранов/макетов) ты видишь на этом изображении? "
                                    "Ответь только числом."
                                )
                                count_columns_response = await analyze_figma_data_with_llm(count_columns_prompt, local_image_path, max_tokens=50)
                                print(f"LLM ответ на вопрос о количестве колонок: '{count_columns_response}'")
                                
                                try:
                                    num_expected_columns = int(count_columns_response.strip())
                                    if num_expected_columns <= 0:
                                        raise ValueError("Количество колонок должно быть положительным.")
                                    print(f"LLM определил {num_expected_columns} колонок.")

                                    # Вызов split_image.py
                                    # split_image_intellectually ожидает путь к исходному изображению
                                    # и сохраняет нарезанные части в ./columns_py_opencv_actual_images/image_name_stem/column_X.png
                                    
                                    # Определяем директорию для сохранения колонок: figma_data/<file_id>/columns_py_opencv_actual_images/<image_name_stem>/
                                    original_image_path_obj = Path(local_image_path)
                                    image_name_stem = original_image_path_obj.stem
                                    columns_output_dir_for_image = base_dir / 'columns_py_opencv_actual_images' / image_name_stem
                                    ensure_dir_exists(columns_output_dir_for_image) # Убедимся, что директория существует

                                    # split_image_intellectually использует cv2.imread, поэтому передаем путь к файлу
                                    split_columns_meta = split_image_intellectually(
                                        image_src=str(local_image_path), # Путь к оригинальному изображению страницы
                                        expected_columns=num_expected_columns,
                                        output_base_dir=base_dir / 'columns_py_opencv_actual_images', # Передаем базовую директорию для колонок
                                    )

                                    if split_columns_meta and len(split_columns_meta) > 0:
                                        page_image_analysis_response_parts.append(f"Изображение было разделено на {len(split_columns_meta)} колонок:\n")
                                        for i, col_meta in enumerate(split_columns_meta):
                                            column_image_path = Path(col_meta['path']) # Путь к сохраненной колонке из split_image_intellectually
                                            
                                            # Сохраняем анализ каждой колонки в отдельный файл
                                            column_analysis_file_name = f"column_analysis_{node_id.replace(':', '_')}_col_{i+1}.txt"
                                            column_analysis_file_path = base_dir / 'column_analyses' / column_analysis_file_name
                                            ensure_dir_exists(column_analysis_file_path.parent)

                                            if column_image_path.exists():
                                                print(f"Анализирую колонку {i+1}/{len(split_columns_meta)} (файл: {column_image_path})...")
                                                
                                                # Промпт для анализа ОДНОЙ КОЛОНКИ
                                                column_analysis_prompt = (
                                                    f"Это изображение одной из {len(split_columns_meta)} колонок (колонка {i+1}) "
                                                    f"оригинальной страницы '{page_name}'. \n\n"
                                                    f"{current_page_analysis_prompt}" # Базовый промпт анализа страницы
                                                )
                                                
                                                col_analysis_response = await analyze_figma_data_with_llm(column_analysis_prompt, str(column_image_path), 16384) # Устанавливаем max_tokens на 16384
                                                save_data_to_file(column_analysis_file_path, col_analysis_response, is_json=False)
                                                print(f"Анализ колонки {i+1} сохранен в: {column_analysis_file_path.name}")
                                                page_image_analysis_response_parts.append(f"\nАнализ колонки {i+1}:\n{col_analysis_response}\n")
                                                
                                                # Добавляем путь к изображению колонки в intermediate_analyses
                                                intermediate_analyses.append({
                                                    'page_name': page_name,
                                                    'node_id': node_id,
                                                    'analysis': col_analysis_response,
                                                    'image_path': str(column_image_path),
                                                    'image_path_col': str(column_image_path) # Добавляем для удобства
                                                })
                                            else:
                                                print(f"Файл для колонки {i+1} не найден: {column_image_path}")
                                                page_image_analysis_response_parts.append(f"\nАнализ колонки {i+1}: Файл не найден.\n")
                                    else:
                                        print("Не удалось разделить изображение на колонки, анализируем целиком.")
                                        # Добавляем указание для LLM, что изображение широкое, но не разделено
                                        wide_image_notice = (
                                            f"ВНИМАНИЕ: Это изображение страницы '{page_name}' (ID: {node_id}) ОЧЕНЬ ШИРОКОЕ "
                                            f"(ширина холста: {actual_page_width}px). Оно не было разделено на колонки. "
                                            "Пожалуйста, учти это при анализе и постарайся идентифицировать отдельные экраны, если они есть.\n\n"
                                        )
                                        full_page_analysis_response = await analyze_figma_data_with_llm(wide_image_notice + current_page_analysis_prompt, local_image_path, 16384) # Устанавливаем max_tokens на 16384
                                        page_image_analysis_response_parts.append(full_page_analysis_response)
                                        intermediate_analyses.append({
                                            'page_name': page_name,
                                            'node_id': node_id,
                                            'analysis': full_page_analysis_response,
                                            'image_path': local_image_path
                                        })
                                except ValueError as e:
                                    print(f"Не удалось получить корректное число колонок от LLM: {e}. Анализируем целиком.")
                                    full_page_analysis_response = await analyze_figma_data_with_llm(current_page_analysis_prompt, local_image_path, 16384) # Устанавливаем max_tokens на 16384
                                    page_image_analysis_response_parts.append(full_page_analysis_response)
                                    intermediate_analyses.append({
                                        'page_name': page_name,
                                        'node_id': node_id,
                                        'analysis': full_page_analysis_response,
                                        'image_path': local_image_path
                                    })
                            else: # LLM ответил "нет" на вопрос о колонках
                                print("LLM не считает, что на изображении несколько колонок. Анализируем целиком.")
                                full_page_analysis_response = await analyze_figma_data_with_llm(current_page_analysis_prompt, local_image_path, 16384) # Устанавливаем max_tokens на 16384
                                page_image_analysis_response_parts.append(full_page_analysis_response)
                                intermediate_analyses.append({
                                    'page_name': page_name,
                                    'node_id': node_id,
                                    'analysis': full_page_analysis_response,
                                    'image_path': local_image_path
                                })
                        else: # Изображение не широкое
                            print(f"Страница '{page_name}' (ширина: {actual_page_width}px) не определена как широкая. Стандартный анализ.")
                            full_page_analysis_response = await analyze_figma_data_with_llm(current_page_analysis_prompt, local_image_path, 16384) # Устанавливаем max_tokens на 16384
                            page_image_analysis_response_parts.append(full_page_analysis_response)
                            intermediate_analyses.append({
                                'page_name': page_name,
                                'node_id': node_id,
                                'analysis': full_page_analysis_response,
                                'image_path': local_image_path
                            })
                        
                        final_page_analysis = "".join(page_image_analysis_response_parts)
                        # Сохраняем общий анализ страницы, который теперь включает анализы колонок
                        save_data_to_file(page_analysis_file_path, final_page_analysis, is_json=False)
                        print(f"Промежуточный анализ для страницы '{page_name}' сохранен в: {page_analysis_file_name}")
                        analysis_prompt_parts.append(f"\nАнализ страницы '{page_name}' (ID: {node_id}):\n{final_page_analysis}\n")

                else: # if node_images_paths
                    analysis_prompt_parts.append("  Изображения страниц не получены.\n")
            else: # if node_ids_to_fetch_images
                analysis_prompt_parts.append("  Нет страниц для запроса изображений.\n")
        else: # if file_info
            analysis_prompt_parts.append("  Не удалось получить детальную информацию о файле.\n")
            print("Не удалось получить детальную информацию о файле Figma.")
    except Exception as e:
        print(f"Ошибка при получении информации о файле или изображениях: {e}")
        analysis_prompt_parts.append(f"  Ошибка при получении информации о файле или изображениях: {e}\n")

    # 3. Получение комментариев
    try:
        print("\n--- Получение комментариев ---")
        comments_data = await get_figma_comments(file_id, base_dir)
        if comments_data and comments_data.get('comments'):
            comments_list = comments_data['comments']
            analysis_prompt_parts.append(f"\nКомментарии ({len(comments_list)} шт.):\n")
            if comments_list:
                for i, comment in enumerate(comments_list[:5]): # Первые 5 комментариев
                    analysis_prompt_parts.append(f"  {i + 1}. {comment.get('message', '')[:100]}...\n")
                if len(comments_list) > 5:
                    analysis_prompt_parts.append(f"  ... и еще {len(comments_list) - 5} комментариев.\n")
            else:
                analysis_prompt_parts.append("  Комментариев нет.\n")
        else:
            analysis_prompt_parts.append("  Не удалось получить комментарии.\n")
    except Exception as e:
        print(f"Ошибка при получении комментариев: {e}")
        analysis_prompt_parts.append(f"  Ошибка при получении комментариев: {e}\n")

    # 4. Итоговый анализ
    analysis_prompt_parts.append("\n\n--- Итоговое задание для LLM ---\n")
    
    if FINAL_ANALYSE_PROMPT_TEMPLATE:
        analysis_prompt_parts.append(FINAL_ANALYSE_PROMPT_TEMPLATE)
        print(f"Используется финальный промпт из файла .env.final_analyse_prompt ({len(FINAL_ANALYSE_PROMPT_TEMPLATE)} символов)")
    else:
        # Резервный промпт, если файл не найден
        fallback_prompt = """
На основе всех собранных данных выше, проведи комплексный анализ Figma файла и дай оценку его сложности.

Включи в анализ:
1. Общую структуру и организацию файла
2. Количество и сложность страниц
3. Качество дизайна и компонентов
4. Уровень детализации и профессионализма
5. Рекомендации по улучшению

Оценка сложности: [Простой/Средний/Сложный/Очень сложный]
"""
        analysis_prompt_parts.append(fallback_prompt.strip())
        print("ВНИМАНИЕ: Используется резервный промпт, так как .env.final_analyse_prompt не загружен")

    final_analysis_prompt_text = "".join(analysis_prompt_parts)
    
    # Сохраняем итоговый промпт перед отправкой в LLM
    final_prompt_file_path = base_dir / 'final_analysis_prompt.txt'
    save_data_to_file(final_prompt_file_path, final_analysis_prompt_text, is_json=False)
    print(f"Итоговый промпт сохранен в файл: {final_prompt_file_path}")
    
    print("\n--- Итоговый анализ данных с помощью LLM ---")
    print("Выполняю итоговый анализ данных Figma... (это может занять несколько минут)")
    
    # Проверяем, есть ли уже готовый итоговый анализ
    summary_file_path = base_dir / 'analysis_summary.txt'
    if summary_file_path.exists():
        print(f"Найден существующий итоговый анализ, загружаем из файла: {summary_file_path}")
        try:
            with open(summary_file_path, 'r', encoding='utf-8') as f:
                llm_analysis_result = f.read().strip()
            if not llm_analysis_result:
                print("Файл итогового анализа пустой, выполняем новый анализ.")
                llm_analysis_result = await analyze_figma_data_with_llm(final_analysis_prompt_text, None, 6000)
                save_data_to_file(summary_file_path, llm_analysis_result, is_json=False)
        except Exception as e:
            print(f"Ошибка при чтении существующего итогового анализа: {e}. Выполняем новый анализ.")
            llm_analysis_result = await analyze_figma_data_with_llm(final_analysis_prompt_text, None, 6000)
            save_data_to_file(summary_file_path, llm_analysis_result, is_json=False)
    else:
        # Для итогового анализа изображение не передается, только текст
        llm_analysis_result = await analyze_figma_data_with_llm(final_analysis_prompt_text, None, 6000)
        save_data_to_file(summary_file_path, llm_analysis_result, is_json=False)

    print("\n--- Завершено ---")
    print(f"Все данные сохранены в директории: {base_dir}")
    print(f"Результат анализа LLM сохранен в: {summary_file_path}")
    
    print("\n--- Результат анализа ---")
    print(llm_analysis_result)

    return {
        "summary": llm_analysis_result,
        "dataPath": str(base_dir),
        "summaryFilePath": str(summary_file_path),
        "intermediateAnalyses": intermediate_analyses, # Возвращаем промежуточные анализы
        "nodeImagesPaths": node_images_paths # Возвращаем пути к изображениям страниц
    }
