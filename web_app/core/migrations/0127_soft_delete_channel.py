from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0126_add_require_manual_approval"),
    ]

    operations = [
        migrations.AddField(
            model_name="channel",
            name="is_deleted",
            field=models.BooleanField(
                default=False,
                verbose_name="Мягко удалён",
                help_text="Канал скрыт из списков и расчётов выплат",
            ),
        ),
    ]

