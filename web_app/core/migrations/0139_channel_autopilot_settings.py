from django.db import migrations, models


def copy_manual_flag(apps, schema_editor):
    Channel = apps.get_model("core", "Channel")
    for channel in Channel.objects.all():
        require_manual = getattr(channel, "require_manual_approval", False)
        channel.auto_approve_publications = not require_manual

        supported_formats = channel.supported_formats or []
        if "autopilot" in supported_formats and not channel.autopilot_min_interval:
            channel.autopilot_min_interval = 60

        channel.save(
            update_fields=["auto_approve_publications", "autopilot_min_interval"]
        )


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0138_add_payout_model"),
    ]

    operations = [
        migrations.AddField(
            model_name="channel",
            name="auto_approve_publications",
            field=models.BooleanField(
                default=False,
                help_text="Если включено, заявки публикуются автоматически без ручного подтверждения",
                verbose_name="Автоутверждение публикаций",
            ),
        ),
        migrations.AddField(
            model_name="channel",
            name="autopilot_min_interval",
            field=models.PositiveIntegerField(
                blank=True,
                help_text="Минимальный интервал между публикациями для кампаний формата «Автопилот». Обязателен, если канал поддерживает формат «Автопилот».",
                null=True,
                verbose_name="Мин. интервал для «Автопилота», мин",
            ),
        ),
        migrations.RunPython(copy_manual_flag, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="channel",
            name="require_manual_approval",
        ),
    ]
