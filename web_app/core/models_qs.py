from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models import Manager

from web_app.logger import logger


@transaction.atomic
def change_channeladmin_group(instance: "ChannelAdmin"):  # noqa:F821
    logger.info(f"change_channeladmin_group: Changing user group for {instance=}")
    if not getattr(instance, "user", None):
        return
    if instance.user.groups.exists():
        instance.user.groups.clear()

    def set_user_group(instance: "ChannelAdmin"):  # noqa:F821
        user = instance.user
        group_name = instance.role
        group, created = Group.objects.get_or_create(name=group_name)
        role_permissions = instance.get_role_permissions()
        content_types = ContentType.objects.get_for_models(
            *role_permissions.content_types
        )
        permissions = Permission.objects.filter(
            content_type__in=(
                content_type.id for content_type in content_types.values()
            )
        )
        if role_permissions.permissions:
            permissions.filter(codename__in=role_permissions.permissions)
        group.permissions.set(permissions)
        user.groups.set([group])

    set_user_group(instance)
    instance.user.refresh_from_db()


class ChannelAdminManager(Manager): ...
