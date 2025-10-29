import requests
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver, Signal
from rest_framework.renderers import JSONRenderer
from datetime import time

from web_app.app_settings import app_settings
from core.models import CampaignChannel, ChannelAdmin, Channel, ChannelPublicationSlot
from web_app.logger import logger
from .models_qs import change_channeladmin_group
from .serializers import CampaignChannelSerializer


def get_create_channel_admin_user(**kwargs):
    from core.models import User

    old_user = User.objects.filter(username=kwargs["username"]).delete()
    logger.info(f"Found Old user {old_user} for this channeladmin, Deleted old user")
    user = User.objects.filter(username=kwargs["username"]).first()
    if not user:
        user = User.objects.create_user(
            username=kwargs["username"],
        )
        user.set_password(kwargs["username"] + "123456")
        user.save()
    User.objects.filter(id=user.id).update(
        first_name=kwargs.get("first_name", ""),
        last_name=kwargs.get("last_name", ""),
        email=kwargs.get("email", ""),
        is_active=True,
        is_superuser=False,
    )
    # user.profile = kwargs.get('channel_admin')
    channel_admin = kwargs.get("channel_admin")
    if channel_admin:
        user.profile = channel_admin
        user.is_staff = True
        user.save()
    return user


def send_message_to_channel_admin(instance: CampaignChannel) -> None:
    """
    Отправляет уведомление владельцу канала о новой публикации с запросом на подтверждение.
    Вызывается только если канал требует ручного подтверждения.
    """
    try:
        if (
            instance.id
            and instance.channel
            and instance.channel_admin
            and instance.channel_admin.is_bot_installed
            and instance.channel_admin.channels.filter(id=instance.channel.id).exists()
            and not instance.is_approved
        ):
            data = JSONRenderer().render(CampaignChannelSerializer(instance).data)
            response = requests.post(
                f"{app_settings.DOMAIN_URI}/telegram/public-campaign-channel",
                data=data,
                headers={"content-type": "application/json"},
            )
            logger.info(f"Sent approval request to {instance.channel_admin} for campaign channel #{instance.id}")
            logger.info(f"Response: {response.status_code} {response.content}")
    except Exception as e:
        logger.error("send_message_to_channel_admin:" + str(e))


@receiver(signal=pre_save, sender=CampaignChannel)
def campaignchannel_pre_save(
    signal: Signal,
    sender: CampaignChannel,
    instance: CampaignChannel,
    raw,
    using,
    update_fields,
    **kwargs,
):
    state_adding = instance._state.adding
    if state_adding and instance.channel:
        # Устанавливаем начальный статус в зависимости от настроек канала
        if not instance.channel.require_manual_approval:
            # Автоматическое подтверждение
            instance.publish_status = CampaignChannel.PublishStatusChoices.CONFIRMED
            logger.info(f"Auto-set CONFIRMED status for campaign channel (channel requires no manual approval)")


@receiver(signal=post_save, sender=CampaignChannel)
def campaignchannel_post_save(
    signal: Signal,
    sender: CampaignChannel,
    instance: CampaignChannel,
    created: bool,
    raw,
    using,
    update_fields,
    **kwargs,
):
    if created:
        # Отправляем уведомление владельцу канала если требуется ручное подтверждение
        if instance.channel and instance.channel.require_manual_approval:
            send_message_to_channel_admin(instance)


@receiver(signal=pre_save, sender=ChannelAdmin)
def change_channeladmin_group_receiver(
    signal: Signal,
    sender: ChannelAdmin,
    instance: ChannelAdmin,
    raw,
    using,
    update_fields,
    **kwargs,
):
    channel_admin = sender.objects.filter(id=instance.id).first()
    if not getattr(channel_admin, "user", None):
        get_create_channel_admin_user(
            channel_admin=instance,
            username=instance.username,
            first_name=instance.first_name,
            last_name=instance.last_name,
            email="",
        )
    if instance.id and (
        not channel_admin or (channel_admin and instance.role != channel_admin.role)
    ):
        change_channeladmin_group(instance)


@receiver(signal=post_save, sender=Channel)
def create_default_publication_slots(
    signal: Signal,
    sender: Channel,
    instance: Channel,
    created: bool,
    raw,
    using,
    update_fields,
    **kwargs,
):
    """Create default publication slots (8:00-21:00) for all weekdays when channel is created"""
    if created and not raw:
        # Create hourly slots from 8:00 to 21:00 for all weekdays
        slots_to_create = []
        for weekday in range(7):  # 0=Monday to 6=Sunday
            for hour in range(8, 21):  # 8:00 to 20:00
                slots_to_create.append(
                    ChannelPublicationSlot(
                        channel=instance,
                        weekday=weekday,
                        start_time=time(hour, 0),
                        end_time=time(hour + 1, 0),
                    )
                )

        ChannelPublicationSlot.objects.bulk_create(slots_to_create, ignore_conflicts=True)
        logger.info(f"Created {len(slots_to_create)} default publication slots for channel {instance.name}")
