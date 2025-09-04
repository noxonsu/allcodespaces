# from django.middleware.common import
import re
from typing import Protocol
from django.conf import settings
from django.http import HttpResponsePermanentRedirect
from django.utils.deprecation import MiddlewareMixin
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
