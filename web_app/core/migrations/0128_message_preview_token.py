import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0127_soft_delete_channel"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="MessagePreviewToken",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True, verbose_name="created at"),
                ),
                (
                    "updated_at",
                    models.DateTimeField(auto_now=True, verbose_name="updated at"),
                ),
                (
                    "token",
                    models.CharField(
                        max_length=255,
                        unique=True,
                        verbose_name="Токен предпросмотра",
                    ),
                ),
                ("expires_at", models.DateTimeField(verbose_name="Истекает")),
                (
                    "used_at",
                    models.DateTimeField(
                        blank=True, null=True, verbose_name="Использован"
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="message_preview_tokens",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Создан",
                    ),
                ),
                (
                    "message",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="preview_tokens",
                        to="core.message",
                        verbose_name="Креатив",
                    ),
                ),
            ],
            options={
                "verbose_name": "Токен предпросмотра",
                "verbose_name_plural": "Токены предпросмотра",
                "ordering": ["-created_at"],
            },
        ),
    ]
