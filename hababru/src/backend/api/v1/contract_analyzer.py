import os
import io
import threading # Импортируем threading
from flask import Blueprint, request, jsonify, current_app, copy_current_request_context # Добавляем copy_current_request_context
from werkzeug.utils import secure_filename
import markdown # Импортируем библиотеку markdown

from ...services import cache_service
# Импорты parsing_service и deepseek_service будут получены через current_app

contract_analyzer_bp = Blueprint('contract_analyzer', __name__)

# Вспомогательная функция для получения сервисов из контекста приложения
def get_parsing_service():
    return current_app.config.get('PARSING_SERVICE')

def get_deepseek_service():
    return current_app.config.get('DEEPSEEK_SERVICE')

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'data', 'uploads')
ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx'}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Вспомогательная функция для выполнения анализа в отдельном потоке
def _run_analysis_task(task_id, full_contract_text, app_context):
    with app_context: # Активируем контекст приложения для доступа к current_app
        logger = current_app.logger
        logger.info(f'TASK {task_id}: Запуск фонового анализа.')
        
        try:
            # 1. Проверка кэша (повторная, на случай, если кэш появился между запросом и запуском задачи)
            cached_analysis = cache_service.get_cached_analysis(full_contract_text)
            if cached_analysis:
                logger.info(f"TASK {task_id}: Анализ найден в кэше, завершаем задачу.")
                cache_service.complete_analysis_task(task_id, cached_analysis)
                return

            # 2. Сегментация текста на пункты/абзацы
            logger.info(f'TASK {task_id}: Сегментация текста на пункты с помощью DeepSeek...')
            _deepseek_service = get_deepseek_service()
            paragraphs = _deepseek_service.segment_text_into_paragraphs(full_contract_text)
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
            cache_service.update_analysis_task_progress(task_id, 0) # Инициализируем прогресс
            
            # 3. Анализ каждого пункта с DeepSeek API
            logger.info(f'TASK {task_id}: Анализ каждого пункта с DeepSeek API...')
            _deepseek_service = get_deepseek_service()
            analysis_results_list = []
            for i, paragraph in enumerate(paragraphs):
                logger.info(f'TASK {task_id}: Анализ пункта {i+1}/{total_paragraphs}: "{paragraph[:50]}..."')
                try:
                    analysis_text = _deepseek_service.analyze_paragraph_in_context(paragraph, full_contract_text)
                    
                    if analysis_text:
                        logger.info(f'TASK {task_id}: DeepSeek анализ для пункта {i+1} получен (первые 50 символов): "{analysis_text[:50]}..."')
                        # Конвертируем Markdown в HTML
                        analysis_html = markdown.markdown(analysis_text)
                        analysis_results_list.append({
                            "paragraph": paragraph,
                            "analysis": analysis_html 
                        })
                        logger.info(f'TASK {task_id}: Анализ пункта {i+1} успешно сконвертирован в HTML.')
                    else:
                        analysis_results_list.append({
                            "paragraph": paragraph,
                            "analysis": "Не удалось получить анализ для этого пункта."
                        })
                        logger.warning(f'TASK {task_id}: Не удалось получить анализ для пункта {i+1}. DeepSeek вернул пустой ответ.')
                except Exception as deepseek_e:
                    logger.error(f'TASK {task_id}: Ошибка при вызове DeepSeek API для пункта {i+1}: {deepseek_e}', exc_info=True)
                    analysis_results_list.append({
                        "paragraph": paragraph,
                        "analysis": f"Ошибка при анализе пункта: {deepseek_e}"
                    })
                
                cache_service.update_analysis_task_progress(task_id, i + 1) # Обновляем прогресс
                
                # Сохранение результатов в кэш после каждого пункта
                current_response_data = {"analysis_results": analysis_results_list, "contract_text_md": full_contract_text}
                cache_service.save_analysis_to_cache(full_contract_text, current_response_data)
                logger.info(f'TASK {task_id}: Результаты анализа пункта {i+1} сохранены в кэш.')
                
            response_data = {"analysis_results": analysis_results_list, "contract_text_md": full_contract_text}
            logger.info(f'TASK {task_id}: Анализ всех пунктов завершен.')

            # Окончательное завершение задачи
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
        file_extension = filename.rsplit('.', 1)[1].lower()
        current_app.logger.info(f'API: Загружен файл: {filename}, расширение: {file_extension}')
        
        file_stream = io.BytesIO(file.read())
        
        # Используем новую функцию для конвертации в Markdown
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

    contract_text_hash = cache_service._generate_cache_key(full_contract_text)

    # 1. Проверка активных задач
    current_app.logger.info('API: Проверка активных задач для данного текста...')
    active_task_id = cache_service.get_active_analysis_task_by_contract_hash(contract_text_hash)
    if active_task_id:
        current_app.logger.info(f"API: Найдена активная задача {active_task_id} для данного текста. Возвращаем ее статус.")
        status_data = cache_service.get_analysis_task_status(active_task_id)
        return jsonify(status_data), 200 # Возвращаем текущий статус активной задачи

    # 2. Проверка кэша (если активной задачи нет)
    current_app.logger.info('API: Проверка кэша...')
    cached_analysis = cache_service.get_cached_analysis(full_contract_text)
    if cached_analysis:
        current_app.logger.info("API: Анализ получен из кэша.")
        # Если анализ уже есть в кэше, создаем "завершенную" задачу и возвращаем ее ID
        task_id = cache_service.create_analysis_task(full_contract_text, 0) # 0 предложений, т.к. уже готово
        cache_service.complete_analysis_task(task_id, cached_analysis)
        # Возвращаем кэшированные результаты вместе со статусом COMPLETED
        return jsonify({"task_id": task_id, "status": "COMPLETED", "message": "Анализ уже в кэше.", "results": cached_analysis}), 200

    # 3. Сегментация текста для определения общего количества пунктов
    current_app.logger.info('API: Предварительная сегментация текста для определения общего количества пунктов...')
    _deepseek_service = get_deepseek_service()
    paragraphs = _deepseek_service.segment_text_into_paragraphs(full_contract_text) # Изменено
    if not paragraphs and full_contract_text:
        current_app.logger.warning('API: Предварительная сегментация не дала результатов, но текст есть. Используем текст как один пункт.')
        paragraphs = [full_contract_text]
    elif not paragraphs and not full_contract_text:
        current_app.logger.error('API: Текст договора пуст или не удалось его обработать и сегментировать для запуска анализа.')
        return jsonify({"error": "Текст договора пуст или не удалось его обработать и сегментировать для запуска анализа."}), 400

    total_paragraphs = len(paragraphs) # Изменено
    
    # 3. Создание задачи анализа
    task_id = cache_service.create_analysis_task(full_contract_text, total_paragraphs, item_type="paragraph") # Изменено
    current_app.logger.info(f'API: Запущена новая задача анализа с ID: {task_id}')

    # 4. Запуск анализа в отдельном потоке
    # Используем copy_current_request_context для сохранения контекста Flask
    # Это позволяет _run_analysis_task получить доступ к current_app
    analysis_thread = threading.Thread(
        target=copy_current_request_context(_run_analysis_task),
        args=(task_id, full_contract_text, current_app.app_context())
    )
    analysis_thread.daemon = True # Поток завершится, когда завершится основное приложение
    analysis_thread.start()

    return jsonify({"task_id": task_id, "status": "PENDING", "message": "Анализ запущен в фоновом режиме."}), 202

@contract_analyzer_bp.route('/get_analysis_status/<task_id>', methods=['GET'])
def get_analysis_status(task_id):
    current_app.logger.info(f'API: Получен запрос на /get_analysis_status для task_id: {task_id}')
    status = cache_service.get_analysis_task_status(task_id)
    if status:
        current_app.logger.info(f'API: Статус задачи {task_id}: {status["status"]}, Прогресс: {status["progress_percentage"]}%')
        return jsonify(status), 200
    else:
        current_app.logger.warning(f'API: Задача с ID {task_id} не найдена.')
        return jsonify({"error": "Задача не найдена"}), 404

# Маршрут для получения примера договора (для фронтенда)
@contract_analyzer_bp.route('/get_sample_contract', methods=['GET'])
def get_sample_contract():
    current_app.logger.info('API: Получен запрос на /get_sample_contract')
    
    # Определяем корневую директорию проекта hababru
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
    
    sample_text_path = os.path.join(
        project_root, 'data', 'sample_contracts', 'default_nda.txt'
    )
    
    # TODO: В будущем, если потребуется, изменить логику для загрузки примеров из content/seo_pages
    # в зависимости от контекста или запроса. Пока оставляем default_nda.txt как основной пример.
    try:
        with open(sample_text_path, 'r', encoding='utf-8') as f:
            nda_text = f.read()
        current_app.logger.info('API: Пример договора успешно загружен.')
        return jsonify({"contract_text": nda_text}), 200
    except FileNotFoundError:
        current_app.logger.error(f'API: Пример договора не найден по пути: {sample_text_path}')
        return jsonify({"error": "Пример договора не найден"}), 404

@contract_analyzer_bp.route('/get_test_contract', methods=['GET'])
def get_test_contract():
    current_app.logger.info('API: Получен запрос на /get_test_contract')
    file_param = request.args.get('file')

    if not file_param:
        current_app.logger.error('API: Отсутствует параметр "file" для тестового договора.')
        return jsonify({"error": "Отсутствует параметр 'file'"}), 400

    # Определяем корневую директорию проекта hababru
    # Это более надежный способ, чем использование '..'
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..')) # Изменено на 4 '..'
    
    # Попытка найти файл в корневой директории проекта hababru/
    file_path_root = os.path.join(project_root, file_param)
    
    # Попытка найти файл в content/seo_pages/
    file_path_seo = os.path.join(project_root, 'content', 'seo_pages', file_param)

    contract_text = None
    file_to_parse = None

    # Проверяем существование файла по обоим путям
    if os.path.exists(file_path_root) and os.path.isfile(file_path_root):
        file_to_parse = file_path_root
        current_app.logger.info(f'API: Найден тестовый файл в корне: {file_path_root}')
    elif os.path.exists(file_path_seo) and os.path.isfile(file_path_seo):
        file_to_parse = file_path_seo
        current_app.logger.info(f'API: Найден тестовый файл в content/seo_pages: {file_path_seo}')
    else:
        current_app.logger.error(f'API: Тестовый файл не найден по путям: {file_path_root} или {file_path_seo}')
        return jsonify({"error": "Тестовый файл не найден"}), 404

    try:
        with open(file_to_parse, 'rb') as f:
            file_stream = io.BytesIO(f.read())
        
        filename = os.path.basename(file_to_parse)
        _parsing_service = get_parsing_service()
        current_app.logger.info(f'API: Конвертация тестового файла {filename} в Markdown...')
        contract_text = _parsing_service.parse_document_to_markdown(file_stream, filename)

        if contract_text:
            current_app.logger.info('API: Тестовый файл успешно сконвертирован в Markdown.')
            return jsonify({"contract_text": contract_text}), 200
        else:
            current_app.logger.error('API: Не удалось обработать тестовый файл.')
            return jsonify({"error": "Не удалось обработать тестовый файл"}), 500
    except Exception as e:
        current_app.logger.error(f'API: Ошибка при чтении или обработке тестового файла: {e}', exc_info=True)
        return jsonify({"error": f"Ошибка при обработке тестового файла: {str(e)}"}), 500
