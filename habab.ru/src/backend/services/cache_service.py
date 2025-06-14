import os
import json
import os
import json
import hashlib
import uuid # Для генерации уникальных ID задач
import threading # Для блокировки при доступе к статусу

CACHE_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'data', 'cache')
os.makedirs(CACHE_DIR, exist_ok=True)

# Словарь для хранения статусов задач в памяти (для простоты, в реальном приложении лучше использовать Redis/DB)
# Ключ: task_id, Значение: словарь со статусом
_analysis_tasks_status = {}
_status_lock = threading.Lock() # Блокировка для безопасного доступа к _analysis_tasks_status

def _generate_cache_key(contract_text):
    """
    Генерирует хеш-ключ для кэша на основе содержимого договора.
    """
    return hashlib.sha256(contract_text.encode('utf-8')).hexdigest()

def get_cached_analysis(contract_text):
    """
    Пытается получить кэшированный анализ для данного договора.
    :param contract_text: Полный текст договора.
    :return: Кэшированный результат анализа (словарь) или None, если не найден.
    """
    cache_key = _generate_cache_key(contract_text)
    cache_file_path = os.path.join(CACHE_DIR, f"{cache_key}.json")

    if os.path.exists(cache_file_path):
        try:
            with open(cache_file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Ошибка при чтении кэша из {cache_file_path}: {e}")
            return None
    return None

def save_analysis_to_cache(contract_text, analysis_results):
    """
    Сохраняет результаты анализа в кэш.
    :param contract_text: Полный текст договора.
    :param analysis_results: Результаты анализа (словарь).
    """
    cache_key = _generate_cache_key(contract_text)
    cache_file_path = os.path.join(CACHE_DIR, f"{cache_key}.json")

    try:
        with open(cache_file_path, 'w', encoding='utf-8') as f:
            json.dump(analysis_results, f, ensure_ascii=False, indent=2)
        print(f"Результаты анализа сохранены в кэш: {cache_file_path}")
    except Exception as e:
        print(f"Ошибка при сохранении кэша в {cache_file_path}: {e}")

def create_analysis_task(contract_text, total_sentences):
    """
    Создает новую задачу анализа и возвращает ее ID.
    :param contract_text: Текст договора.
    :param total_sentences: Общее количество предложений для анализа.
    :return: task_id (строка)
    """
    task_id = str(uuid.uuid4())
    with _status_lock:
        _analysis_tasks_status[task_id] = {
            "status": "PENDING",
            "total_sentences": total_sentences,
            "processed_sentences": 0,
            "progress_percentage": 0,
            "results": None,
            "error": None,
            "contract_text_hash": _generate_cache_key(contract_text) # Храним хеш для связи с кэшем
        }
    return task_id

def update_analysis_task_progress(task_id, processed_sentences):
    """
    Обновляет прогресс выполнения задачи анализа.
    :param task_id: ID задачи.
    :param processed_sentences: Количество уже проанализированных предложений.
    """
    with _status_lock:
        if task_id in _analysis_tasks_status:
            status_data = _analysis_tasks_status[task_id]
            status_data["processed_sentences"] = processed_sentences
            if status_data["total_sentences"] > 0:
                status_data["progress_percentage"] = int((processed_sentences / status_data["total_sentences"]) * 100)
            status_data["status"] = "PROCESSING"
        else:
            print(f"Ошибка: Задача с ID {task_id} не найдена для обновления прогресса.")

def complete_analysis_task(task_id, results):
    """
    Отмечает задачу анализа как завершенную и сохраняет результаты.
    :param task_id: ID задачи.
    :param results: Окончательные результаты анализа.
    """
    with _status_lock:
        if task_id in _analysis_tasks_status:
            status_data = _analysis_tasks_status[task_id]
            status_data["status"] = "COMPLETED"
            status_data["processed_sentences"] = status_data["total_sentences"] # Устанавливаем на максимум
            status_data["progress_percentage"] = 100
            status_data["results"] = results
        else:
            print(f"Ошибка: Задача с ID {task_id} не найдена для завершения.")

def fail_analysis_task(task_id, error_message):
    """
    Отмечает задачу анализа как проваленную и сохраняет сообщение об ошибке.
    :param task_id: ID задачи.
    :param error_message: Сообщение об ошибке.
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
    :param task_id: ID задачи.
    :return: Словарь со статусом задачи или None, если задача не найдена.
    """
    with _status_lock:
        return _analysis_tasks_status.get(task_id)

def get_active_analysis_task_by_contract_hash(contract_text_hash):
    """
    Возвращает ID активной задачи анализа для данного хеша договора, если она существует.
    Активная задача - это PENDING или PROCESSING.
    :param contract_text_hash: Хеш текста договора.
    :return: task_id (строка) или None.
    """
    with _status_lock:
        for task_id, status_data in _analysis_tasks_status.items():
            if status_data["contract_text_hash"] == contract_text_hash and \
               status_data["status"] in ["PENDING", "PROCESSING"]:
                return task_id
        return None

if __name__ == '__main__':
    # Пример использования
    sample_contract_1 = "Это первый тестовый договор. Он очень короткий."
    sample_contract_2 = "Это второй тестовый договор. Он отличается от первого."
    sample_contract_1_modified = "Это первый тестовый договор. Он очень короткий. Изменено."

    sample_analysis_1 = {
        "sentence_1": {"risks": ["Риск А"], "recommendations": ["Рекомендация А"], "connections": ["Связь А"]},
        "sentence_2": {"risks": ["Риск Б"], "recommendations": ["Рекомендация Б"], "connections": ["Связь Б"]}
    }
    sample_analysis_2 = {
        "sentence_1": {"risks": ["Риск В"], "recommendations": ["Рекомендация В"], "connections": ["Связь В"]}
    }

    print("--- Тестирование Cache Service ---")

    # Тест 1: Сохранение и получение первого договора
    print("\nСохраняем анализ для sample_contract_1...")
    save_analysis_to_cache(sample_contract_1, sample_analysis_1)
    cached_1 = get_cached_analysis(sample_contract_1)
    if cached_1:
        print("Получен кэшированный анализ для sample_contract_1:")
        print(json.dumps(cached_1, indent=2, ensure_ascii=False))
    else:
        print("Кэшированный анализ для sample_contract_1 не найден.")

    # Тест 2: Сохранение и получение второго договора
    print("\nСохраняем анализ для sample_contract_2...")
    save_analysis_to_cache(sample_contract_2, sample_analysis_2)
    cached_2 = get_cached_analysis(sample_contract_2)
    if cached_2:
        print("Получен кэшированный анализ для sample_contract_2:")
        print(json.dumps(cached_2, indent=2, ensure_ascii=False))
    else:
        print("Кэшированный анализ для sample_contract_2 не найден.")

    # Тест 3: Попытка получить измененный первый договор (должен быть None)
    print("\nПытаемся получить анализ для измененного sample_contract_1 (должен быть None)...")
    cached_1_modified = get_cached_analysis(sample_contract_1_modified)
    if cached_1_modified:
        print("Ошибка: Получен кэшированный анализ для измененного sample_contract_1.")
    else:
        print("Кэшированный анализ для измененного sample_contract_1 не найден (ожидаемо).")

    # Очистка тестовых файлов кэша
    print("\nОчистка тестовых файлов кэша...")
    for f in os.listdir(CACHE_DIR):
        if f.endswith('.json'):
            os.remove(os.path.join(CACHE_DIR, f))
            print(f"Удален: {f}")
