import os
import json
import hashlib
import uuid
import threading

# Определяем базовую директорию для кэша.
# Теперь это data/cache/ в корне проекта hababru.
CACHE_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'data', 'cache')
os.makedirs(CACHE_DIR, exist_ok=True)

# Словарь для хранения статусов задач в памяти
_analysis_tasks_status = {}
_status_lock = threading.Lock() # Блокировка для безопасного доступа

# Директория для кэша SEO контента
SEO_CACHE_DIR = os.path.join(CACHE_DIR, 'seo_content')
os.makedirs(SEO_CACHE_DIR, exist_ok=True)

# Директория для кэша результатов сегментации текста
SEGMENTATION_CACHE_DIR = os.path.join(CACHE_DIR, 'segmentations')
os.makedirs(SEGMENTATION_CACHE_DIR, exist_ok=True)

def _generate_hash(text):
    """
    Генерирует SHA256 хеш для любого текста.
    Используется для создания file_hash и paragraph_hash.
    """
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def get_file_cache_dir(file_hash):
    """
    Возвращает путь к директории кэша для конкретного файла и создает ее, если не существует.
    Структура: data/cache/<file_hash>/
    """
    file_cache_path = os.path.join(CACHE_DIR, file_hash)
    os.makedirs(file_cache_path, exist_ok=True)
    return file_cache_path

def get_cached_paragraph_analysis(file_hash, paragraph_text):
    """
    Пытается получить кэшированный анализ для конкретного абзаца из конкретного файла.
    Кэш абзаца хранится в data/cache/<file_hash>/<paragraph_hash>.json
    :param file_hash: Хеш исходного файла.
    :param paragraph_text: Текст абзаца.
    :return: Кэшированный результат анализа абзаца (строка HTML) или None.
    """
    paragraph_hash = _generate_hash(paragraph_text)
    file_specific_cache_dir = get_file_cache_dir(file_hash)
    cache_file_path = os.path.join(file_specific_cache_dir, f"{paragraph_hash}.json")

    if os.path.exists(cache_file_path):
        try:
            with open(cache_file_path, 'r', encoding='utf-8') as f:
                # Ожидаем, что JSON содержит {"paragraph": "...", "analysis": "...", ...}
                # Возвращаем только значение "analysis"
                return json.load(f).get("analysis")
        except Exception as e:
            print(f"Ошибка при чтении кэша абзаца из {cache_file_path}: {e}")
            return None
    return None

def save_paragraph_analysis_to_cache(file_hash, paragraph_text, analysis_html):
    """
    Сохраняет результаты анализа конкретного абзаца в кэш.
    Структура файла: data/cache/<file_hash>/<paragraph_hash>.json
    Содержимое файла: {"paragraph": "...", "analysis": "...", "paragraph_hash": "...", "file_hash": "..."}
    :param file_hash: Хеш исходного файла.
    :param paragraph_text: Текст абзаца.
    :param analysis_html: Результат анализа абзаца (HTML).
    """
    paragraph_hash = _generate_hash(paragraph_text)
    file_specific_cache_dir = get_file_cache_dir(file_hash)
    cache_file_path = os.path.join(file_specific_cache_dir, f"{paragraph_hash}.json")
    
    data_to_save = {
        "paragraph": paragraph_text,
        "analysis": analysis_html,
        "paragraph_hash": paragraph_hash,
        "file_hash": file_hash # Сохраняем для информации
    }

    try:
        with open(cache_file_path, 'w', encoding='utf-8') as f:
            json.dump(data_to_save, f, ensure_ascii=False, indent=2)
        print(f"Результаты анализа абзаца сохранены в кэш: {cache_file_path}")
    except Exception as e:
        print(f"Ошибка при сохранении кэша абзаца в {cache_file_path}: {e}")

def check_all_paragraphs_cached(file_hash, paragraphs_texts_list):
    """
    Проверяет, закэшированы ли все абзацы для данного файла.
    Если да, собирает их и возвращает полный результат анализа.
    :param file_hash: Хеш исходного файла.
    :param paragraphs_texts_list: Список текстов абзацев договора.
    :return: Полный результат анализа (словарь {"analysis_results": [...], "contract_text_md": "..."}) 
             или None, если не все абзацы закэшированы.
    """
    cached_analysis_results_list = []
    for p_text in paragraphs_texts_list:
        analysis_html = get_cached_paragraph_analysis(file_hash, p_text)
        if analysis_html is None:
            return None # Если хотя бы один абзац не закэширован, возвращаем None
        cached_analysis_results_list.append({
            "paragraph": p_text,
            "analysis": analysis_html
        })
    
    # Собираем полный текст договора из абзацев для поля "contract_text_md"
    full_contract_text_md = "\n\n".join(paragraphs_texts_list)
    return {"analysis_results": cached_analysis_results_list, "contract_text_md": full_contract_text_md}

def create_analysis_task(file_hash, total_items, item_type="paragraph"):
    """
    Создает новую задачу анализа и возвращает ее ID.
    :param file_hash: Хеш исходного файла (ранее contract_text_hash).
    :param total_items: Общее количество элементов (абзацев) для анализа.
    :param item_type: Тип элементов ('paragraph').
    :return: task_id (строка)
    """
    task_id = str(uuid.uuid4())
    with _status_lock:
        _analysis_tasks_status[task_id] = {
            "status": "PENDING",
            "total_items": total_items,
            "processed_items": 0,
            "progress_percentage": 0,
            "results": None,
            "error": None,
            "file_hash": file_hash, # Используем file_hash
            "item_type": item_type
        }
    return task_id

def update_analysis_task_progress(task_id, processed_items):
    """
    Обновляет прогресс выполнения задачи анализа.
    """
    with _status_lock:
        if task_id in _analysis_tasks_status:
            status_data = _analysis_tasks_status[task_id]
            status_data["processed_items"] = processed_items
            if status_data["total_items"] > 0:
                status_data["progress_percentage"] = int((processed_items / status_data["total_items"]) * 100)
            status_data["status"] = "PROCESSING"
        else:
            print(f"Ошибка: Задача с ID {task_id} не найдена для обновления прогресса.")

def complete_analysis_task(task_id, results):
    """
    Отмечает задачу анализа как завершенную и сохраняет результаты.
    """
    with _status_lock:
        if task_id in _analysis_tasks_status:
            status_data = _analysis_tasks_status[task_id]
            status_data["status"] = "COMPLETED"
            status_data["processed_items"] = status_data["total_items"]
            status_data["progress_percentage"] = 100
            status_data["results"] = results
        else:
            print(f"Ошибка: Задача с ID {task_id} не найдена для завершения.")

def fail_analysis_task(task_id, error_message):
    """
    Отмечает задачу анализа как проваленную и сохраняет сообщение об ошибке.
    """
    with _status_lock:
        if task_id in _analysis_tasks_status:
            status_data = _analysis_tasks_status[task_id]
            status_data["status"] = "FAILED"
            status_data["error"] = error_message
        else:
            print(f"Ошибка: Задача с ID {task_id} не найдена для отметки как проваленной.")

def get_analysis_task_status(task_id):
    """
    Возвращает текущий статус задачи анализа.
    """
    with _status_lock:
        return _analysis_tasks_status.get(task_id)

def get_active_analysis_task_by_file_hash(file_hash):
    """
    Возвращает ID активной задачи анализа для данного хеша файла (анализ договора), если она существует.
    Активная задача - это PENDING или PROCESSING.
    :param file_hash: Хеш текста файла.
    :return: task_id (строка) или None.
    """
    with _status_lock:
        for task_id, status_data in _analysis_tasks_status.items():
            if status_data.get("file_hash") == file_hash and \
               status_data["status"] in ["PENDING", "PROCESSING"]:
                return task_id
        return None

# Функции для кэширования SEO контента (простое кэширование всего объекта)
def get_seo_cached_analysis(content_key_text):
    """
    Пытается получить кэшированный анализ для SEO-контента.
    Ключ генерируется из content_key_text.
    Кэш хранится в data/cache/seo_content/<hash>.json
    :param content_key_text: Текст, используемый для генерации ключа кэша (например, текст SEO-договора).
    :return: Кэшированный результат анализа (словарь) или None.
    """
    cache_key = _generate_hash(content_key_text)
    cache_file_path = os.path.join(SEO_CACHE_DIR, f"{cache_key}.json")

    if os.path.exists(cache_file_path):
        try:
            with open(cache_file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Ошибка при чтении SEO кэша из {cache_file_path}: {e}")
            return None
    return None

def save_seo_analysis_to_cache(content_key_text, analysis_data):
    """
    Сохраняет результаты анализа SEO-контента в кэш.
    :param content_key_text: Текст, используемый для генерации ключа кэша.
    :param analysis_data: Результаты анализа (словарь).
    """
    cache_key = _generate_hash(content_key_text)
    cache_file_path = os.path.join(SEO_CACHE_DIR, f"{cache_key}.json")

    try:
        with open(cache_file_path, 'w', encoding='utf-8') as f:
            json.dump(analysis_data, f, ensure_ascii=False, indent=2)
        print(f"Результаты SEO анализа сохранены в кэш: {cache_file_path}")
    except Exception as e:
        print(f"Ошибка при сохранении SEO кэша в {cache_file_path}: {e}")

# Функции для кэширования результатов сегментации текста
def get_cached_segmentation(text_content_hash):
    """
    Пытается получить кэшированный результат сегментации текста.
    Кэш хранится в data/cache/segmentations/<text_content_hash>.json
    :param text_content_hash: Хеш исходного текста, который был сегментирован.
    :return: Список абзацев (list of str) или None.
    """
    cache_file_path = os.path.join(SEGMENTATION_CACHE_DIR, f"{text_content_hash}.json")

    if os.path.exists(cache_file_path):
        try:
            with open(cache_file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Ошибка при чтении кэша сегментации из {cache_file_path}: {e}")
            return None
    return None

def save_segmentation_to_cache(text_content_hash, paragraphs_list):
    """
    Сохраняет результат сегментации текста в кэш.
    :param text_content_hash: Хеш исходного текста.
    :param paragraphs_list: Список абзацев (list of str).
    """
    cache_file_path = os.path.join(SEGMENTATION_CACHE_DIR, f"{text_content_hash}.json")

    try:
        with open(cache_file_path, 'w', encoding='utf-8') as f:
            json.dump(paragraphs_list, f, ensure_ascii=False, indent=2)
        print(f"Результаты сегментации сохранены в кэш: {cache_file_path}")
    except Exception as e:
        print(f"Ошибка при сохранении кэша сегментации в {cache_file_path}: {e}")

if __name__ == '__main__':
    # Пример использования (обновленный для новой логики)
    sample_file_content_1 = "Это первый тестовый договор. Он очень короткий."
    sample_file_content_2 = "Это второй тестовый договор. Он отличается от первого. И имеет еще один абзац."

    file_hash_1 = _generate_hash(sample_file_content_1)
    file_hash_2 = _generate_hash(sample_file_content_2)

    # Предположим, что segment_text_into_paragraphs вернул бы:
    paragraphs_1 = ["Это первый тестовый договор.", "Он очень короткий."]
    paragraphs_2 = ["Это второй тестовый договор.", "Он отличается от первого.", "И имеет еще один абзац."]
    
    # Анализы для абзацев (пример)
    analysis_p1_1 = "<p>Анализ для 'Это первый тестовый договор.'</p>"
    analysis_p1_2 = "<p>Анализ для 'Он очень короткий.'</p>"
    analysis_p2_1 = "<p>Анализ для 'Это второй тестовый договор.'</p>"
    analysis_p2_2 = "<p>Анализ для 'Он отличается от первого.'</p>"
    analysis_p2_3 = "<p>Анализ для 'И имеет еще один абзац.'</p>"

    print("--- Тестирование Cache Service (Новая Логика) ---")

    # Тест 1: Сохранение и получение анализа абзацев для первого файла
    print(f"\nСохраняем анализ абзацев для file_hash_1: {file_hash_1}")
    save_paragraph_analysis_to_cache(file_hash_1, paragraphs_1[0], analysis_p1_1)
    save_paragraph_analysis_to_cache(file_hash_1, paragraphs_1[1], analysis_p1_2)

    print("\nПроверяем кэш для первого абзаца file_hash_1:")
    cached_p1_1 = get_cached_paragraph_analysis(file_hash_1, paragraphs_1[0])
    if cached_p1_1:
        print(f"Получен: {cached_p1_1}")
    else:
        print("Не найден.")

    print("\nПроверяем, все ли абзацы file_hash_1 закэшированы:")
    full_cached_analysis_1 = check_all_paragraphs_cached(file_hash_1, paragraphs_1)
    if full_cached_analysis_1:
        print("Все абзацы закэшированы. Полный результат:")
        print(json.dumps(full_cached_analysis_1, indent=2, ensure_ascii=False))
    else:
        print("Не все абзацы закэшированы.")

    # Тест 2: Сохранение и получение для второго файла (частично)
    print(f"\nСохраняем анализ первого абзаца для file_hash_2: {file_hash_2}")
    save_paragraph_analysis_to_cache(file_hash_2, paragraphs_2[0], analysis_p2_1)
    
    print("\nПроверяем, все ли абзацы file_hash_2 закэшированы (ожидаем None):")
    full_cached_analysis_2_partial = check_all_paragraphs_cached(file_hash_2, paragraphs_2)
    if full_cached_analysis_2_partial:
        print("Ошибка: Не должно быть полного кэша.")
    else:
        print("Не все абзацы закэшированы (ожидаемо).")

    # Тест 3: Сохраняем остальные абзацы для второго файла
    print(f"\nСохраняем остальные абзацы для file_hash_2:")
    save_paragraph_analysis_to_cache(file_hash_2, paragraphs_2[1], analysis_p2_2)
    save_paragraph_analysis_to_cache(file_hash_2, paragraphs_2[2], analysis_p2_3)

    print("\nПроверяем, все ли абзацы file_hash_2 закэшированы (теперь ожидаем результат):")
    full_cached_analysis_2_complete = check_all_paragraphs_cached(file_hash_2, paragraphs_2)
    if full_cached_analysis_2_complete:
        print("Все абзацы закэшированы. Полный результат:")
        print(json.dumps(full_cached_analysis_2_complete, indent=2, ensure_ascii=False))
    else:
        print("Ошибка: Должны быть все абзацы.")

    # Тест 4: Проверка работы с задачами
    task_id_1 = create_analysis_task(file_hash_1, len(paragraphs_1))
    print(f"\nСоздана задача {task_id_1} для file_hash_1. Статус:")
    print(get_analysis_task_status(task_id_1))

    update_analysis_task_progress(task_id_1, 1)
    print(f"\nОбновлен прогресс задачи {task_id_1}. Статус:")
    print(get_analysis_task_status(task_id_1))
    
    complete_analysis_task(task_id_1, full_cached_analysis_1)
    print(f"\nЗавершена задача {task_id_1}. Статус:")
    print(get_analysis_task_status(task_id_1))

    active_task = get_active_analysis_task_by_file_hash(file_hash_2) # Должен быть None, т.к. нет активных
    print(f"\nАктивная задача для file_hash_2: {active_task}")

    task_id_2 = create_analysis_task(file_hash_2, len(paragraphs_2))
    active_task = get_active_analysis_task_by_file_hash(file_hash_2)
    print(f"Создана задача {task_id_2} для file_hash_2. Активная задача: {active_task}")

    # --- Тестирование SEO кэша ---
    print("\n--- Тестирование SEO Cache Service ---")
    seo_key_1 = "seo_contract_text_1"
    seo_data_1 = {"summary": "SEO Summary 1", "paragraphs": [{"text": "p1", "analysis": "a1"}]}
    
    print(f"\nСохраняем SEO анализ для ключа: {seo_key_1}")
    save_seo_analysis_to_cache(seo_key_1, seo_data_1)
    
    cached_seo_1 = get_seo_cached_analysis(seo_key_1)
    if cached_seo_1:
        print("Получен кэшированный SEO анализ:")
        print(json.dumps(cached_seo_1, indent=2, ensure_ascii=False))
    else:
        print("Кэшированный SEO анализ не найден.")

    cached_seo_2 = get_seo_cached_analysis("non_existent_key")
    if cached_seo_2:
        print("Ошибка: найден несуществующий SEO ключ.")
    else:
        print("Несуществующий SEO ключ не найден в кэше (ожидаемо).")

    # --- Тестирование кэша сегментации ---
    print("\n--- Тестирование Segmentation Cache Service ---")
    seg_text_1 = "Это текст для сегментации. Он состоит из двух предложений."
    seg_hash_1 = _generate_hash(seg_text_1)
    seg_result_1 = ["Это текст для сегментации.", "Он состоит из двух предложений."]

    print(f"\nСохраняем результат сегментации для хэша: {seg_hash_1}")
    save_segmentation_to_cache(seg_hash_1, seg_result_1)

    cached_seg_1 = get_cached_segmentation(seg_hash_1)
    if cached_seg_1 and cached_seg_1 == seg_result_1:
        print("Получен кэшированный результат сегментации:")
        print(cached_seg_1)
    else:
        print("Ошибка: Кэшированный результат сегментации не найден или не совпадает.")

    cached_seg_2 = get_cached_segmentation(_generate_hash("другой текст"))
    if cached_seg_2:
        print("Ошибка: найден несуществующий ключ сегментации.")
    else:
        print("Несуществующий ключ сегментации не найден в кэше (ожидаемо).")

    # Очистка тестовых файлов кэша
    print("\nОчистка тестовых файлов кэша...")
    import shutil
    for item_name in os.listdir(CACHE_DIR):
        item_path = os.path.join(CACHE_DIR, item_name)
        if os.path.isdir(item_path): # Удаляем поддиректории (file_hash, seo_content, segmentations)
            shutil.rmtree(item_path)
            print(f"Удалена директория: {item_path}")
        elif os.path.isfile(item_path) and item_path.endswith('.json'): # На случай, если остались старые файлы
            os.remove(item_path)
            print(f"Удален файл: {item_path}")
