import os
from flask import Flask, render_template, send_from_directory, abort, jsonify # Добавляем jsonify
from dotenv import load_dotenv
import subprocess
import os
import io # Добавляем io

# Импорты сервисов
from .api.v1.contract_analyzer import contract_analyzer_bp
from .services.llm_service import LLMService # Изменено на LLMService
from .services.yandex_wordstat_service import YandexWordstatService
from .services.seo_service import SeoService
from .services.parsing_service import ParsingService # Для анализа на лету

# Загрузка переменных окружения из .env файла
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

app = Flask(__name__, 
            root_path=os.path.join(os.path.dirname(__file__), '..', '..'), # Указываем корневую директорию hababru
            static_folder='public', # Теперь это относительный путь от root_path
            template_folder=os.path.join(os.path.dirname(__file__), 'templates')) # Этот путь остается относительным от текущего файла

# Инициализация сервисов
llm_service = LLMService( # Изменено на llm_service
    deepseek_api_key=os.getenv('DEEPSEEK_API_KEY'),
    openai_api_key=os.getenv('OPENAI_API_KEY') # Добавлен ключ OpenAI
)
yandex_wordstat_service = YandexWordstatService(
    client_id=os.getenv('YANDEX_CLIENT_ID'),
    client_secret=os.getenv('YANDEX_CLIENT_SECRET'),
    redirect_uri=os.getenv('YANDEX_REDIRECT_URI'),
    oauth_token=os.getenv('YANDEX_OAUTH_TOKEN')
)
parsing_service = ParsingService(llm_service=llm_service) # Изменено на llm_service

# Инициализация SeoService с зависимостями
seo_service = SeoService(
    llm_service=llm_service, # Изменено на llm_service
    yandex_wordstat_service=yandex_wordstat_service,
    parsing_service=parsing_service, # Передаем для анализа на лету
    content_base_path=os.path.join(app.root_path, 'content', 'seo_pages')
)

# Сохраняем экземпляры сервисов в конфигурации приложения, чтобы они были доступны в Blueprint
app.config['PARSING_SERVICE'] = parsing_service
app.config['LLM_SERVICE'] = llm_service # Изменено на LLM_SERVICE

# Регистрация Blueprint для API
app.register_blueprint(contract_analyzer_bp, url_prefix='/api/v1')

# Маршрут для главной страницы приложения
@app.route('/')
def index():
    # Передаем данные для рендеринга главной страницы через index_template.html
    # is_seo_page=False означает, что это не SEO-страница
    # Остальные SEO-специфичные переменные будут иметь значения по умолчанию (None или пустые строки)
    return render_template('index_template.html', is_seo_page=False)

# Маршрут для обслуживания статических файлов (CSS, JS, assets)
@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory(os.path.join(app.static_folder, 'css'), filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory(os.path.join(app.static_folder, 'js'), filename)

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    return send_from_directory(os.path.join(app.static_folder, 'assets'), filename)

@app.route('/favicon.ico')
def favicon():
    return send_from_directory(app.static_folder, 'favicon.ico', mimetype='image/vnd.microsoft.icon')

@app.route('/robots.txt')
def serve_robots_txt():
    return send_from_directory(app.static_folder, 'robots.txt', mimetype='text/plain')

# Маршрут для обслуживания файлов из data/sample_contracts
@app.route('/data/sample_contracts/<path:filename>')
def serve_sample_contract(filename):
    return send_from_directory(os.path.join(app.root_path, 'data', 'sample_contracts'), filename)

# Маршрут для обслуживания сгенерированных файлов договоров для SEO-страниц
@app.route('/content/seo_pages/<slug>/<filename>')
def serve_generated_contract(slug, filename):
    # Убедимся, что запрашивается только generated_contract.txt
    if filename != 'generated_contract.txt':
        abort(404)
    
    file_path = os.path.join(app.root_path, 'content', 'seo_pages', slug)
    return send_from_directory(file_path, filename)

@app.route('/get_test_contract', methods=['GET'])
def get_test_contract():
    app.logger.info('API: Получен запрос на /get_test_contract (без параметров)')

    # Определяем корневую директорию проекта hababru
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
    
    # Явно указываем путь к файлу generated_contract.txt
    file_to_parse = os.path.join(
        project_root, 'content', 'seo_pages', 'analiz-dogovora-arendy', 'generated_contract.txt'
    )
    
    app.logger.info(f'API: Попытка загрузить тестовый файл по явному пути: {file_to_parse}')

    if not os.path.exists(file_to_parse) or not os.path.isfile(file_to_parse):
        app.logger.error(f'API: Тестовый файл не найден по явному пути: {file_to_parse}')
        return jsonify({"error": "Тестовый файл не найден"}), 404

    app.logger.info(f'API: Конечный путь к файлу для парсинга: {file_to_parse}')
    try:
        with open(file_to_parse, 'rb') as f:
            file_stream = io.BytesIO(f.read())
        
        filename = os.path.basename(file_to_parse)
        _parsing_service = app.config.get('PARSING_SERVICE') # Получаем сервис из app.config
        app.logger.info(f'API: Конвертация тестового файла {filename} в Markdown...')
        app.logger.info(f'API: Имя файла для парсинга: {filename}')
        contract_text = _parsing_service.parse_document_to_markdown(file_stream, filename)

        if contract_text:
            app.logger.info('API: Тестовый файл успешно сконвертирован в Markdown.')
            return jsonify({"contract_text": contract_text}), 200
        else:
            app.logger.error('API: Не удалось обработать тестовый файл.')
            return jsonify({"error": "Не удалось обработать тестовый файл"}), 500
    except Exception as e:
        app.logger.error(f'API: Ошибка при чтении или обработке тестового файла: {e}', exc_info=True)
        return jsonify({"error": f"Ошибка при обработке тестового файла: {str(e)}"}), 500

# Маршрут для SEO-страниц
@app.route('/<slug>')
def seo_page(slug):
    app.logger.info(f"Запрос на SEO-страницу: /{slug}")
    # Проверяем, не является ли slug именем статического файла или зарезервированным маршрутом
    # Это очень упрощенная проверка, в реальном приложении нужна более надежная логика
    if slug in ['css', 'js', 'assets', 'favicon.ico', 'robots.txt', 'api', 'data', 'dataaquisitionnoxon', 'dataaquisitionnoxon.pub', 'exportLinks.php', 'insertCategories.php', 'openai_admin.js', 'package.json', 'processed_videos_log.csv', 'README.md', 'robots.txt', 'sensoica_shortcode.php', 'showTasks.php', '1csync', 'ads', 'aeroclub', 'aml', 'amogt', 'apifront', 'asterisk', 'hababru', 'chemistry', 'content', 'data', 'fbads', 'figmar', 'flru', 'gpts', 'hims', 'megaplan', 'nastya', 'plugins', 'sashanoxonbot', 'themes', 'tts', 'wa', 'youtube']:
        app.logger.warning(f"Запрос на зарезервированный slug: {slug}")
        abort(404)
    
    # Используем SeoService для рендеринга страницы
    try:
        app.logger.info(f"Попытка рендеринга SEO-страницы '{slug}' через SeoService.")
        html_content = seo_service.render_seo_page(slug)
        app.logger.info(f"SEO-страница '{slug}' успешно отрендерена.")
        return html_content
    except FileNotFoundError as e:
        app.logger.error(f"SEO-страница не найдена для слага '{slug}': {e}")
        abort(404)
    except Exception as e:
        app.logger.exception(f"Критическая ошибка при рендеринге SEO-страницы '{slug}': {e}") # Используем exception для полного traceback
        abort(500)

# Маршрут для тестового режима
# TODO: Пересмотреть необходимость этого маршрута, так как SEO-страницы теперь динамически анализируют
#       договор при загрузке. Возможно, он останется для отладки других файлов.
#       Пока оставляем как есть.
# if __name__ == '__main__':
#     # Убиваем любой процесс, использующий порт 5001 перед запуском
#     try:
#         subprocess.run(['kill', '$(lsof -t -i:5001)', '||', 'true'], shell=True, check=False)
#     except Exception as e:
#         app.logger.warning(f"Не удалось убить процесс на порту 5001: {e}")
    
#     app.run(debug=True, port=5002) # Изменяем порт на 5002

if __name__ == '__main__':
    # Убиваем любой процесс, использующий порт 5001 перед запуском
    try:
        # Используем lsof для поиска процесса, слушающего порт 5001, и kill для его завершения
        # '|| true' позволяет команде не завершаться с ошибкой, если процесс не найден
        subprocess.run(['kill', '$(lsof -t -i:5001)', '||', 'true'], shell=True, check=False)
    except Exception as e:
        app.logger.warning(f"Не удалось убить процесс на порту 5001: {e}")
    
    app.run(debug=True, port=5002) # Изменяем порт на 5002
