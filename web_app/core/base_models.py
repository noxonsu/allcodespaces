from uuid import uuid4

from django.utils.translation import gettext_lazy as _
from django.db import models


def des_nulls_last(field_name):
    return models.F(field_name).desc(nulls_last=True)


class BaseModel(models.Model):
    """Base fields for most of db-models"""

    id = models.UUIDField(
        primary_key=True, db_index=True, editable=False, default=uuid4
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_("Создано"))
    updated_at = models.DateTimeField(auto_now=True, verbose_name=_("Обновлено"))

    class Meta:
        abstract = True
        ordering = [des_nulls_last("created_at"), des_nulls_last("updated_at")]
        get_latest_by = [des_nulls_last("created_at"), des_nulls_last("updated_at")]
