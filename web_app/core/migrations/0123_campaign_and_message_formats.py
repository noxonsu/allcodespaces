from django.db import migrations, models
import django.contrib.postgres.fields
import core.models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0122_auto_20250922_1144"),
    ]

    operations = [
        migrations.AddField(
            model_name="campaign",
            name="format",
            field=models.CharField(
                choices=[
                    ("sponsorship", "Спонсорство"),
                    ("fixed_slot", "Фикс-слот"),
                    ("autopilot", "Автопилот"),
                ],
                default="autopilot",
                max_length=32,
                verbose_name="Формат размещения",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="campaign",
            name="slot_publication_at",
            field=models.DateTimeField(
                blank=True,
                help_text="Обязательно для формата «Фикс-слот»",
                null=True,
                verbose_name="Дата и время публикации",
            ),
        ),
        migrations.AddField(
            model_name="channel",
            name="supported_formats",
            field=django.contrib.postgres.fields.ArrayField(
                base_field=models.CharField(
                    choices=[
                        ("sponsorship", "Спонсорство"),
                        ("fixed_slot", "Фикс-слот"),
                        ("autopilot", "Автопилот"),
                    ],
                    max_length=32,
                ),
                blank=True,
                default=core.models.default_supported_formats,
                size=None,
                verbose_name="Поддерживаемые форматы",
            ),
        ),
        migrations.AddField(
            model_name="message",
            name="format",
            field=models.CharField(
                choices=[
                    ("sponsorship", "Спонсорство"),
                    ("fixed_slot", "Фикс-слот"),
                    ("autopilot", "Автопилот"),
                ],
                default="autopilot",
                max_length=32,
                verbose_name="Формат размещения",
            ),
            preserve_default=False,
        ),
    ]
