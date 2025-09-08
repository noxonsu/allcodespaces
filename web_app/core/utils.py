from decimal import Decimal
from string import Template
import requests

from web_app.app_settings import app_settings
from web_app.logger import logger


def get_property_attr(col, model, attr_name):
    return getattr(getattr(model, col).fget, attr_name)


def budget_cpm(impressions_plan=None, cpm=None):
    return (
        Decimal(Decimal(impressions_plan / 1000) * cpm).quantize(Decimal("0.01"))
        if cpm and impressions_plan
        else 0
    )


def budget_cpm_from_qs(qs: "QuerySet[CampaignChannel]"):  # noqa: F821
    total = 0
    for row in qs:
        if row.campaign and row.channel:
            total += budget_cpm(cpm=row.cpm, impressions_plan=row.impressions_plan)
    return total


class RolePermissions:
    def __init__(self, content_types, permissions):
        self.content_types = content_types
        self.permissions = permissions

    @property
    def content_types(self):
        return self._content_types

    @content_types.setter
    def content_types(self, apps_str):
        from django.apps import apps

        _apps = []
        for app_str in apps_str:
            app = apps.get_model(f"core.{app_str}")
            _apps.append(app)
        self._content_types = _apps

    @property
    def permissions(self):
        return self._permissions

    @permissions.setter
    def permissions(self, permissions_list):
        if isinstance(permissions_list, str) and permissions_list == "__all__":
            self._permissions = []
        else:
            self._permissions = permissions_list


def bulk_notify_channeladmin(list_data: list, *, roles: set[str]) -> None:
    """Send notification to channeladmins that they were added in channel"""
    from core.tasks import task_notify_channeladmin_was_added_channel
    for row in list_data:
        if getattr(row, 'channeladmin', None) and row.channeladmin.role in roles:
            logger.info(f'[bulk_notify_channeladmin] send data to celery worker to {row.channeladmin}')
            task_notify_channeladmin_was_added_channel.delay(
                channel_name=row.channel.name,
                channeladmin_tgid=row.channeladmin.tg_id,
            )



class BotNotifier:
    """Service object to send communicate with the bot hooks/endpoints"""

    routes: dict[str, str] = {
        'channeladmin-added': app_settings.DOMAIN_URI + "/telegram/channeladmin-added"
    }

    def channeladmin_added(self, channel_name:str, channeladmin_tgid: str, msg: str=None) -> None:
        """Informing the channel admin that he has been added to a channel"""
        try:
            template = Template('Вы указаны администратором канала $channel_name')
            msg_template = template.safe_substitute(channel_name=channel_name) if not msg else msg
            url = self.routes['channeladmin-added']
            data = dict(tg_id=channeladmin_tgid, msg=msg_template)
            response = requests.post(url, json=data)
            logger.info(f'[{__class__}].channeladmin_added: response status {response.status_code}.')
        except Exception as e:
            logger.error(f"channeladmin_added: {e}")

