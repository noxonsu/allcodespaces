import os
import io
import threading
from flask import Blueprint, request, jsonify, current_app, copy_current_request_context
from werkzeug.utils import secure_filename
import markdown

# Используем обновленный cache_service
from ...services import cache_service

contract_analyzer_bp = Blueprint('contract_analyzer', __name__)

def get_parsing_service():
    return current_app.config.get('PARSING_SERVICE')

def get_llm_service():
    return current_app.config.get('LLM_SERVICE')

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'data', 'uploads')
ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx'}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def _run_analysis_task(task_id, file_hash, full_contract_text, app_context):
    """
    Выполняет анализ договора в отдельном потоке.
    Теперь использует file_hash для кэширования на уровне абзацев.
    """
    with app_context:
        logger = current_app.logger
        logger.info(f'TASK {task_id} (File Hash: {file_hash}): Запуск фонового анализа.')
        
        try:
            # 1. Сегментация текста на пункты/абзацы
            logger.info(f'TASK {task_id}: Сегментация текста на пункты с помощью LLM...')
            _llm_service = get_llm_service()
            paragraphs = _llm_service.segment_text_into_paragraphs(full_contract_text)
            logger.info(f'TASK {task_id}: Получено {len(paragraphs)} пунктов после сегментации.')

            if not paragraphs and full_contract_text:
                logger.warning(f'TASK {task_id}: Сегментация не дала результатов, но текст есть. Используем текст как один пункт.')
                paragraphs = [full_contract_text]
            elif not paragraphs and not full_contract_text:
                error_msg = "Текст договора пуст или не удалось его обработать и сегментировать."
                logger.error(f'TASK {task_id}: {error_msg}')
                cache_service.fail_analysis_task(task_id, error_msg)
                return

            total_paragraphs = len(paragraphs)
            cache_service.update_analysis_task_progress(task_id, 0)
            
            # 2. Анализ каждого пункта с LLM API (с проверкой кэша абзацев)
            logger.info(f'TASK {task_id}: Анализ каждого пункта с LLM API...')
            analysis_results_list = []
            for i, paragraph_text in enumerate(paragraphs):
                logger.info(f'TASK {task_id}: Подготовка к анализу пункта {i+1}/{total_paragraphs}.')
                
                # Проверяем кэш для текущего абзаца, используя file_hash
                cached_paragraph_analysis_html = cache_service.get_cached_paragraph_analysis(file_hash, paragraph_text)
                
                if cached_paragraph_analysis_html:
                    logger.info(f"TASK {task_id}: Анализ пункта {i+1} (хэш абзаца: {cache_service._generate_hash(paragraph_text)}) найден в кэше.")
                    analysis_results_list.append({
                        "paragraph": paragraph_text,
                        "analysis": cached_paragraph_analysis_html
                    })
                else:
                    logger.info(f'TASK {task_id}: Анализ пункта {i+1}/{total_paragraphs} (хэш абзаца: {cache_service._generate_hash(paragraph_text)}): "{paragraph_text[:50]}..."')
                    try:
                        analysis_api_response_text = _llm_service.analyze_paragraph_in_context(paragraph_text, full_contract_text)
                        
                        if analysis_api_response_text:
                            logger.info(f'TASK {task_id}: LLM анализ для пункта {i+1} получен (первые 50 символов): "{analysis_api_response_text[:50]}..."')
                            analysis_html = markdown.markdown(analysis_api_response_text)
                            analysis_results_list.append({
                                "paragraph": paragraph_text,
                                "analysis": analysis_html 
                            })
                            # Сохраняем результат анализа абзаца в кэш
                            cache_service.save_paragraph_analysis_to_cache(file_hash, paragraph_text, analysis_html)
                            logger.info(f'TASK {task_id}: Анализ пункта {i+1} успешно сконвертирован в HTML и сохранен в кэш абзацев.')
                        else:
                            analysis_results_list.append({
                                "paragraph": paragraph_text,
                                "analysis": "Не удалось получить анализ для этого пункта."
                            })
                            logger.warning(f'TASK {task_id}: Не удалось получить анализ для пункта {i+1}. LLM вернул пустой ответ.')
                    except Exception as llm_e:
                        logger.error(f'TASK {task_id}: Ошибка при вызове LLM API для пункта {i+1}: {llm_e}', exc_info=True)
                        analysis_results_list.append({
                            "paragraph": paragraph_text,
                            "analysis": f"Ошибка при анализе пункта: {llm_e}"
                        })
                
                cache_service.update_analysis_task_progress(task_id, i + 1)
                
            response_data = {"analysis_results": analysis_results_list, "contract_text_md": full_contract_text}
            logger.info(f'TASK {task_id}: Анализ всех пунктов завершен.')

            cache_service.complete_analysis_task(task_id, response_data)
            logger.info(f'TASK {task_id}: Задача анализа завершена успешно.')

        except Exception as e:
            logger.error(f'TASK {task_id}: Ошибка при выполнении анализа: {e}', exc_info=True)
            cache_service.fail_analysis_task(task_id, str(e))

@contract_analyzer_bp.route('/upload_contract', methods=['POST'])
def upload_contract():
    current_app.logger.info('API: Получен запрос на /upload_contract')
    if 'file' not in request.files:
        current_app.logger.error('API: Файл не найден в запросе')
        return jsonify({"error": "Файл не найден в запросе"}), 400
    
    file = request.files['file']
    if file.filename == '':
        current_app.logger.error('API: Файл не выбран')
        return jsonify({"error": "Файл не выбран"}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        current_app.logger.info(f'API: Загружен файл: {filename}')
        
        file_stream = io.BytesIO(file.read())
        _parsing_service = get_parsing_service()
        current_app.logger.info(f'API: Конвертация файла {filename} в Markdown...')
        contract_text = _parsing_service.parse_document_to_markdown(file_stream, filename)
        
        if contract_text:
            current_app.logger.info('API: Файл успешно сконвертирован в Markdown.')
            return jsonify({"message": "Файл успешно загружен и обработан", "contract_text": contract_text}), 200
        else:
            current_app.logger.error('API: Не удалось обработать файл.')
            return jsonify({"error": "Не удалось обработать файл"}), 500
    else:
        current_app.logger.error('API: Недопустимый тип файла.')
        return jsonify({"error": "Недопустимый тип файла"}), 400

@contract_analyzer_bp.route('/start_analysis', methods=['POST'])
def start_analysis():
    current_app.logger.info('API: Получен запрос на /start_analysis')
    data = request.get_json()
    full_contract_text = data.get('full_contract_text')

    if not full_contract_text:
        current_app.logger.error('API: Отсутствует полный текст договора для анализа.')
        return jsonify({"error": "Отсутствует полный текст договора для анализа"}), 400

    # Генерируем хеш файла для организации кэша
    file_hash = cache_service._generate_hash(full_contract_text)
    current_app.logger.info(f'API: Сгенерирован file_hash: {file_hash} для анализа.')

    # 1. Предварительная сегментация текста для определения общего количества пунктов
    current_app.logger.info('API: Предварительная сегментация текста...')
    _llm_service = get_llm_service()
    paragraphs = _llm_service.segment_text_into_paragraphs(full_contract_text)
    if not paragraphs and full_contract_text:
        current_app.logger.warning('API: Предварительная сегментация не дала результатов, используем текст как один пункт.')
        paragraphs = [full_contract_text]
    elif not paragraphs and not full_contract_text:
        current_app.logger.error('API: Текст договора пуст для сегментации.')
        return jsonify({"error": "Текст договора пуст или не удалось его сегментировать."}), 400
    
    total_paragraphs = len(paragraphs)
    current_app.logger.info(f'API: Общее количество абзацев для анализа: {total_paragraphs}')

    # 2. Проверка активных задач по file_hash
    current_app.logger.info(f'API: Проверка активных задач для file_hash: {file_hash}...')
    active_task_id = cache_service.get_active_analysis_task_by_file_hash(file_hash)
    if active_task_id:
        current_app.logger.info(f"API: Найдена активная задача {active_task_id} для file_hash {file_hash}. Возвращаем ее статус.")
        status_data = cache_service.get_analysis_task_status(active_task_id)
        return jsonify(status_data), 200

    # 3. Проверка, закэшированы ли все абзацы для данного file_hash
    current_app.logger.info(f'API: Проверка полного кэша для file_hash: {file_hash}...')
    # Передаем список текстов абзацев в check_all_paragraphs_cached
    all_cached_results = cache_service.check_all_paragraphs_cached(file_hash, paragraphs)
    if all_cached_results:
        current_app.logger.info(f"API: Все абзацы для file_hash {file_hash} найдены в кэше.")
        # Создаем "завершенную" задачу и возвращаем ее ID с результатами
        task_id = cache_service.create_analysis_task(file_hash, total_paragraphs, item_type="paragraph")
        cache_service.complete_analysis_task(task_id, all_cached_results)
        return jsonify({"task_id": task_id, "status": "COMPLETED", "message": "Анализ уже полностью в кэше.", "results": all_cached_results}), 200

    # 4. Создание новой задачи анализа, если не все абзацы закэшированы и нет активной задачи
    task_id = cache_service.create_analysis_task(file_hash, total_paragraphs, item_type="paragraph")
    current_app.logger.info(f'API: Запущена новая задача анализа с ID: {task_id} для file_hash: {file_hash}')

    # 5. Запуск анализа в отдельном потоке
    analysis_thread = threading.Thread(
        target=copy_current_request_context(_run_analysis_task),
        args=(task_id, file_hash, full_contract_text, current_app.app_context()) # Передаем file_hash
    )
    analysis_thread.daemon = True
    analysis_thread.start()

    return jsonify({"task_id": task_id, "status": "PENDING", "message": "Анализ запущен в фоновом режиме."}), 202

@contract_analyzer_bp.route('/hello', methods=['GET'])
def hello_world():
    current_app.logger.info('API: Получен запрос на /hello')
    return "Hello World from Contract Analyzer!", 200

@contract_analyzer_bp.route('/get_analysis_status/<task_id>', methods=['GET'])
def get_analysis_status(task_id):
    current_app.logger.info(f'API: Получен запрос на /get_analysis_status для task_id: {task_id}')
    status = cache_service.get_analysis_task_status(task_id)
    if status:
        current_app.logger.info(f'API: Статус задачи {task_id}: {status.get("status")}, Прогресс: {status.get("progress_percentage")}%')
        return jsonify(status), 200
    else:
        current_app.logger.warning(f'API: Задача с ID {task_id} не найдена.')
        return jsonify({"error": "Задача не найдена"}), 404

@contract_analyzer_bp.route('/get_sample_contract', methods=['GET'])
def get_sample_contract():
    current_app.logger.info('API: Получен запрос на /get_sample_contract')
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
    sample_text_path = os.path.join(project_root, 'data', 'sample_contracts', 'default_nda.txt')
    try:
        with open(sample_text_path, 'r', encoding='utf-8') as f:
            nda_text = f.read()
        current_app.logger.info('API: Пример договора успешно загружен.')
        return jsonify({"contract_text": nda_text}), 200
    except FileNotFoundError:
        current_app.logger.error(f'API: Пример договора не найден по пути: {sample_text_path}')
        return jsonify({"error": "Пример договора не найден"}), 404
