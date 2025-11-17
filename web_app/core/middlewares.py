# from django.middleware.common import
import re
from typing import Protocol
from django.conf import settings
from django.http import HttpResponsePermanentRedirect, HttpResponse
from django.utils.deprecation import MiddlewareMixin
from django.utils import timezone
from django.db.utils import ProgrammingError, OperationalError
from web_app.logger import logger


class MiddlewareProtocol(Protocol):
    def __init__(self, get_response):
        self.get_response = get_response
        # One-time configuration and initialization.

    def __call__(self, request):
        # Code to be executed for each request before
        # the view (and later middleware) are called.

        response = self.get_response(request)

        # Code to be executed for each request/response after
        # the view is called.

        return response


# class IPMiddleware(MiddlewareMixin):
class IPMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Code to be executed for each request before
        # the view (and later middleware) are called.
        ip = request.headers.get(
            "X-Real-Ip",
            request.headers.get("X-Forwarded-For", request.META.get("REMOTE_ADDR")),
        )
        print(f"IPMiddleware {ip=} init connection.")
        if ip in set(settings.IP_BLOCKLIST):
            logger.info(
                f"IPMiddleware blocked {ip=} tried to access app at {timezone.now()}"
            )
            redirect_to = "https://example.com"
            return HttpResponsePermanentRedirect(redirect_to=redirect_to)
        response = self.get_response(request)

        # Code to be executed for each request/response after
        # the view is called.

        return response


class PathRestrictMiddleware(MiddlewareMixin):
    def process_request(self, request):
        pattern = r"^\/(static|media|core|api|redoc|docs)(.+)?$|^\/$"
        path = request.path
        match = re.findall(pattern, path)
        if not match:
            logger.info(
                f"PathRestrictMiddleware blocked {request.path=} tried to access app at {timezone.now()}"
            )
            redirect_to = "https://example.com"
            return HttpResponsePermanentRedirect(redirect_to=redirect_to)


class DatabaseMigrationCheckMiddleware:
    """
    Middleware для перехвата ошибок отсутствующих миграций БД
    и отображения понятного сообщения вместо трейсбека
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            response = self.get_response(request)
            return response
        except (ProgrammingError, OperationalError) as e:
            return self.handle_migration_error(e, request)

    def handle_migration_error(self, exception, request):
        """Обрабатывает ошибки БД связанные с миграциями"""
        error_message = str(exception)

        # CHANGE: Перехватываем ошибки отсутствующих колонок/таблиц
        # WHY: Для предоставления понятного сообщения администратору о необходимости запуска миграций
        # REF: Задача по улучшению UX при непримененных миграциях

        migration_keywords = [
            "column", "does not exist",
            "relation", "does not exist",
            "table", "doesn't exist",
            "no such column",
            "unknown column"
        ]

        is_migration_error = any(
            keyword.lower() in error_message.lower()
            for keyword in migration_keywords
        )

        if is_migration_error:
            logger.error(
                f"Migration error detected: {error_message} | "
                f"Path: {request.path} | Method: {request.method}"
            )

            html_content = self._generate_migration_error_page(error_message)
            return HttpResponse(html_content, status=500, content_type='text/html')

        # Если это не ошибка миграции, пробрасываем дальше
        raise exception

    def _generate_migration_error_page(self, error_message):
        """Генерирует HTML-страницу с инструкцией по запуску миграций"""
        return f"""
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Требуется запуск миграций базы данных</title>
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    margin: 0;
                    padding: 20px;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }}
                .container {{
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    max-width: 800px;
                    padding: 40px;
                }}
                .header {{
                    display: flex;
                    align-items: center;
                    margin-bottom: 30px;
                }}
                .icon {{
                    font-size: 48px;
                    margin-right: 20px;
                }}
                h1 {{
                    color: #e53e3e;
                    margin: 0;
                    font-size: 28px;
                }}
                .subtitle {{
                    color: #718096;
                    margin-top: 10px;
                    font-size: 16px;
                }}
                .error-box {{
                    background: #fff5f5;
                    border-left: 4px solid #fc8181;
                    padding: 16px;
                    margin: 20px 0;
                    border-radius: 4px;
                    font-family: "Courier New", monospace;
                    font-size: 13px;
                    color: #742a2a;
                    overflow-x: auto;
                }}
                .solution {{
                    background: #f0fff4;
                    border-left: 4px solid #48bb78;
                    padding: 20px;
                    margin: 20px 0;
                    border-radius: 4px;
                }}
                .solution h2 {{
                    color: #2f855a;
                    margin-top: 0;
                    font-size: 20px;
                }}
                .command-box {{
                    background: #1a202c;
                    color: #68d391;
                    padding: 16px;
                    border-radius: 6px;
                    font-family: "Courier New", monospace;
                    margin: 10px 0;
                    overflow-x: auto;
                    position: relative;
                }}
                .command-box::before {{
                    content: "$ ";
                    color: #48bb78;
                }}
                .step {{
                    margin: 20px 0;
                    padding-left: 30px;
                    position: relative;
                }}
                .step::before {{
                    content: attr(data-step);
                    position: absolute;
                    left: 0;
                    top: 0;
                    background: #667eea;
                    color: white;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: bold;
                }}
                .note {{
                    background: #fffaf0;
                    border-left: 4px solid #ed8936;
                    padding: 16px;
                    margin: 20px 0;
                    border-radius: 4px;
                    font-size: 14px;
                }}
                .note strong {{
                    color: #c05621;
                }}
                a {{
                    color: #667eea;
                    text-decoration: none;
                }}
                a:hover {{
                    text-decoration: underline;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="icon">🔧</div>
                    <div>
                        <h1>Требуется запуск миграций базы данных</h1>
                        <div class="subtitle">База данных не синхронизирована с моделями Django</div>
                    </div>
                </div>

                <div class="error-box">
                    <strong>Ошибка БД:</strong><br>
                    {error_message}
                </div>

                <div class="solution">
                    <h2>✅ Как исправить:</h2>

                    <div class="step" data-step="1">
                        <strong>Если используется Docker:</strong>
                        <div class="command-box">docker-compose -f web_app/docker-compose.yml exec web-app python manage.py migrate</div>
                    </div>

                    <div class="step" data-step="2">
                        <strong>Если запуск локально:</strong>
                        <div class="command-box">cd /root/TELEWIN/web_app && python3 manage.py migrate</div>
                    </div>

                    <div class="step" data-step="3">
                        <strong>Если нужно создать новые миграции:</strong>
                        <div class="command-box">python3 manage.py makemigrations</div>
                        <div class="command-box">python3 manage.py migrate</div>
                    </div>
                </div>

                <div class="note">
                    <strong>ℹ️ Примечание:</strong><br>
                    После успешного выполнения миграций обновите страницу браузера.
                    Если проблема сохраняется, проверьте логи приложения.
                </div>

                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #718096; font-size: 14px;">
                    <strong>Дополнительная информация:</strong><br>
                    • <a href="https://docs.djangoproject.com/en/stable/topics/migrations/" target="_blank">Django Migrations Documentation</a><br>
                    • <a href="/admin/" target="_blank">Django Admin Panel</a><br>
                    • Проект: TeleWin Platform
                </div>
            </div>
        </body>
        </html>
        """
