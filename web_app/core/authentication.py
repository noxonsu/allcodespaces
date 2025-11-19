"""
CHANGE: Added Bearer token authentication for microservice integration
WHY: Required by ТЗ 4.1.2 - secure endpoint with authentication
QUOTE(ТЗ): "реализовать защищённый эндпоинт/очередь"
REF: issue #46
"""
from rest_framework import authentication
from rest_framework import exceptions
from web_app.app_settings import app_settings
from core.metrics import authentication_attempts


class MicroserviceBearerTokenAuthentication(authentication.BaseAuthentication):
    """
    Bearer token authentication for microservice integration.

    Validates incoming requests using PARSER_MICROSERVICE_API_KEY from settings.
    """

    def authenticate(self, request):
        """
        Authenticate the request and return a two-tuple of (user, token).

        Returns None if authentication should be skipped (no Authorization header).
        Raises AuthenticationFailed if authentication fails.
        """
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')

        if not auth_header:
            authentication_attempts.labels(result="missing_header").inc()
            return None

        # Check Bearer token format
        parts = auth_header.split()

        if len(parts) != 2 or parts[0].lower() != 'bearer':
            authentication_attempts.labels(result="invalid_format").inc()
            raise exceptions.AuthenticationFailed('Invalid authorization header format. Expected: Bearer <token>')

        token = parts[1]

        # Validate against configured API key
        expected_key = app_settings.PARSER_MICROSERVICE_API_KEY

        if not expected_key:
            authentication_attempts.labels(result="not_configured").inc()
            raise exceptions.AuthenticationFailed('Microservice authentication not configured')

        if token != expected_key:
            authentication_attempts.labels(result="invalid_key").inc()
            raise exceptions.AuthenticationFailed('Invalid microservice API key')

        # Track successful authentication
        authentication_attempts.labels(result="success").inc()

        # Return dummy user (microservice doesn't need real user object)
        # We use None for user, and token as auth credential
        return (None, token)

    def authenticate_header(self, request):
        """
        Return a string to be used as the value of the WWW-Authenticate
        header in a 401 Unauthenticated response.
        """
        return 'Bearer realm="Microservice API"'
