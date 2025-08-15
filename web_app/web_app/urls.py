from django.contrib import admin
from django.urls import include, path
from rest_framework.authtoken.views import obtain_auth_token
from rest_framework import permissions
from drf_yasg.views import get_schema_view
from drf_yasg import openapi


schema_view = get_schema_view(
   openapi.Info(
      title="TeleWin API",
      default_version='v1',
      description="TeleWin is a project for managing a Telegram bot backend",
      contact=openapi.Contact(email="amohamed@gramant.ru"),
   ),
   public=True,
   permission_classes=(permissions.AllowAny,),
)


urlpatterns = [
   path("api/"      , include("core.urls")),
   path("api/login/jwt/", view=obtain_auth_token),
   path('docs/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),
   path('docs.<format>/', schema_view.without_ui(cache_timeout=0), name='schema-json'),
   path('redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),
   path("", include('django_prometheus.urls')),
   path("", admin.site.urls),
]
