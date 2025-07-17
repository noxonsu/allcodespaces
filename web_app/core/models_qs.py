from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models import Manager, Q

from web_app.logger import logger


@transaction.atomic
def change_channeladmin_group(instance: "ChannelAdmin"):
        from core.models import ChannelAdmin
        def user_owners_permissions_get_create(user: "User"):
                from core.models import CampaignChannel
                group, created = Group.objects.get_or_create(name='owners')
                if created:
                        content_type = ContentType.objects.get_for_model(CampaignChannel)
                        permissions = Permission.objects.filter(codename__in=['view_campaignchannel', 'view_channel'],
                                                                content_type=content_type)
                        group.permissions.set(permissions)
                group.user_set.add(user)

        def user_manager_permissions_get_create(user: "User"):
                from core.models import CampaignChannel
                group, created = Group.objects.get_or_create(name='managers')
                if created:
                        from core.models import MessageLink
                        from core.models import ChannelAdmin
                        from core.models import Message
                        from core.models import Channel
                        from core.models import Campaign
                        content_types = ContentType.objects.get_for_models(CampaignChannel, Channel, Message,
                                                                           ChannelAdmin, MessageLink, Campaign)
                        permissions = Permission.objects.filter(
                                content_type__in=(content_type.id for content_type in content_types.values()),)
                        group.permissions.set(permissions)
                group.user_set.add(user)

        if not getattr(instance, 'user', None):
                return

        if instance.user.groups.exists():
                instance.user.groups.all().delete()

        logger.info(f'{instance.role=}')
        if instance.role == ChannelAdmin.Role.OWNER:
                user_owners_permissions_get_create(instance.user)
        elif instance.role == ChannelAdmin.Role.MANAGER:
                user_manager_permissions_get_create(instance.user)
        instance.user.refresh_from_db()


def get_create_channel_admin_user(**kwargs):
        from core.models import User
        user= User.objects.filter(username=kwargs['username']).first()
        if not user:
                user= User.objects.create_user(username=kwargs['username'])
                user.set_password(kwargs['username'] + '123456')
                user.save()
        User.objects.filter(id=user.id).update(
                first_name=kwargs['first_name'],
                last_name=kwargs['last_name'],
                username=kwargs['username'],
                email=kwargs.get('email', kwargs['username']),
                is_staff=True,
                is_active=True,
                is_superuser=False)
        return user

class ChannelAdminManager(Manager):
        def create_normal_user(self, *args, **kwargs):
                user = get_create_channel_admin_user(**kwargs)
                channel_admin = super().create(user=user, *args, **kwargs)
                return channel_admin

        def create(self, *args, **kwargs):
                return self.create_normal_user(*args, **kwargs)

