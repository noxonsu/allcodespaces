from rest_framework.throttling import BaseThrottle, UserRateThrottle, AnonRateThrottle


class RequestAccessThrottle(AnonRateThrottle):
    
    def allow_request(self, request, view):
        print(f'{dir(request._request)}')
        print(f'{request._request.headers}')
        return super().allow_request(request, view)