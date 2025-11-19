from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"
    verbose_name = " "
    verbose_name_plural = " "
    version = "1.0"

    def ready(self):
        # Ensure JSONField doesn't fail when drivers return native Python objects.
        from django.db.models import JSONField as DjangoJSONField

        if not getattr(DjangoJSONField, "_telewin_safe_patch", False):
            original_from_db_value = DjangoJSONField.from_db_value

            def safe_from_db_value(self, value, expression, connection):
                if isinstance(value, (dict, list)) or value is None:
                    return value
                return original_from_db_value(self, value, expression, connection)

            DjangoJSONField.from_db_value = safe_from_db_value
            DjangoJSONField._telewin_safe_patch = True

        from . import signals  # noqa
