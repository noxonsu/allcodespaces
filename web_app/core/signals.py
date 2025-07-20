import requests
from django.db.models.signals import pre_save
from django.dispatch import receiver, Signal
from rest_framework.renderers import JSONRenderer

from web_app.app_settings import app_settings
from core.models import CampaignChannel, ChannelAdmin
from .models_qs import change_channeladmin_group
from .serializers import CampaignChannelSerializer


def get_create_channel_admin_user(**kwargs):
    from core.models import User
    user = User.objects.filter(username=kwargs['username']).first()
    if not user:
        user = User.objects.create_user(
            username=kwargs['username'],
        )
        user.set_password(kwargs['username'] + '123456')
        user.save()
    User.objects.filter(id=user.id).update(
        first_name=kwargs.get('first_name', ''),
        last_name=kwargs.get('last_name', ''),
        email=kwargs.get('email', ''),
        is_staff=True,
        is_active=True,
        is_superuser=False)
    # user.profile = kwargs.get('channel_admin')
    channel_admin = kwargs.get('channel_admin')
    if channel_admin:
        user.profile = channel_admin
        user.save()
    return user


def send_message_to_channel_admin(instance: CampaignChannel)-> None:
    if instance.id and instance.channel\
            and instance.channel_admin\
            and instance.channel_admin.is_bot_installed\
            and instance.channel_admin.channels.filter(
            id=instance.channel.id).exists()\
            and not instance.is_approved:

        data = JSONRenderer().render(CampaignChannelSerializer(instance).data)
        response = requests.post(f'{app_settings.DOMAIN_URI}/telegram/public-campaign-channel', data=data, headers={'content-type': 'application/json'})
        print(f'message sent to {instance.channel_admin}')
        print(f'response {response} {response.content}')


@receiver(signal=pre_save, sender=CampaignChannel)
def campaignchannel_pre_save(signal: Signal, sender: CampaignChannel, instance: CampaignChannel, raw, using, update_fields, **kwargs):
    state_adding = instance._state.adding
    if state_adding:
        send_message_to_channel_admin(instance)


@receiver(signal=pre_save, sender=ChannelAdmin)
def change_channeladmin_group_receiver(signal: Signal, sender: ChannelAdmin, instance: ChannelAdmin, raw, using, update_fields, **kwargs):
    channel_admin = sender.objects.filter(id=instance.id).first()
    get_create_channel_admin_user(
        channel_admin=instance,
        username=instance.username,
        first_name=instance.first_name,
        last_name=instance.last_name,
        email="",
    )
    if instance.id and (not channel_admin or (channel_admin and instance.role != channel_admin.role)):
        change_channeladmin_group(instance)
