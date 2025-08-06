# from django.middleware.common import
from typing import Protocol
from django.conf import settings
from django.http import HttpResponsePermanentRedirect
from rest_framework.exceptions import PermissionDenied
from django.utils import timezone
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

class IPMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Code to be executed for each request before
        # the view (and later middleware) are called.
        print(f'{vars(request)=}')
        ip = request.headers.get('X-Real-Ip', request.headers.get('X-Forwarded-For', request.META.get("REMOTE_ADDR")))
        print(f'IPMiddleware {ip=} init connection.')
        if ip in set(settings.IP_BLOCKLIST):
            logger.info(f'IPMiddleware blocked {ip=} tried to access app at {timezone.now()}')
            redirect_to = request.headers.get('referer', request.META.get('HTTP_REFERER', 'https://example.com'))
            return HttpResponsePermanentRedirect(redirect_to=redirect_to)
        response = self.get_response(request)

        # Code to be executed for each request/response after
        # the view is called.

        return response
