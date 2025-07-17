from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"
    verbose_name = " "
    verbose_name_plural = " "
    version = "1.0"


    def ready(self):
        from . import signals  #nooqe