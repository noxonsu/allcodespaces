from decimal import Decimal
from functools import cached_property
from string import Template
from typing import Sequence
from warnings import deprecated

import requests
from django.apps import apps
from django.db.models import Q
from django.db.transaction import atomic

from web_app.app_settings import app_settings
from web_app.logger import logger


def get_property_attr(col, model, attr_name):
    return getattr(getattr(model, col).fget, attr_name)


def budget_cpm(impressions_plan=None, cpm=None):
    return (
        Decimal(Decimal(impressions_plan / 1000) * cpm).quantize(Decimal("0.011"))
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


def get_template_side_data(app_name: str, nav_header_name='', exclude=None, permissions=None):
        class SideMenuObject:
            def __init__(self, app_name: str,
                         nav_header_name=nav_header_name,
                         exclude: Sequence[str]=None,
                         permissions_list=None):
                self.app_label = app_name
                self.nav_header_name = nav_header_name
                self._permissions = permissions_list if permissions_list else []
                self._data = {}
                self._exclude = exclude if exclude else set()
                self._set_up()
                self.add_models()

            @cached_property
            def _prepare_app_models(self):
                def filter_model(model):
                    return model._meta.app_label == self.app_label\
                        and model._meta.db_table.startswith(app_name+'_')\
                        and model._meta.auto_created is False\
                        and model._meta.model_name not in self._exclude

                return [
                    (model._meta.model_name, model._meta.verbose_name_plural.capitalize())
                    for model in self._models
                    if filter_model(model)
                ]


            def _set_up(self):
                self._data['app_label'] = self.app_label
                self._data['models'] = []
                self._data['name'] = self.nav_header_name
                self._models = apps.get_models(self.app_label)


            def add_model(self, model_name: str, name:str,icon=None):
                model_settings: dict = dict(object_name=model_name, admin_url=f'/{self.app_label}/{model_name}/', name=name)
                if icon:
                    model_settings.update(icon=icon)
                if self._permissions:
                    model_settings.update(permissions=self._permissions)
                self._data['models'].append(model_settings)

            def add_models(self):
                for model_name, name in self._prepare_app_models:
                    self.add_model(model_name, name)

            def remove_model(self, model_name: str):
                for i in self._data['models']:
                    if i['object_name'] == model_name:
                        del i['object_name']

            @property
            def app_models(self):
                return self._data

        return SideMenuObject(app_name, nav_header_name, exclude, permissions_list=permissions)

@atomic
@deprecated('this function would be removed soon')
def update_broken_channel_avatar() ->None:
    """ this function is meant to update all avatars to have a default image"""
    from core.models import Channel

    default_path = '/static/custom/default.jpg'
    channels = Channel.objects.filter(~Q(avatar_url=default_path), is_deleted=False)
    channels_list = []

    for channel in channels:
        try:
            url = channel.avatar_url
            if channel.avatar_url and channel.avatar_url.startswith('//static'):
                """this is url for tgstat images"""
                url = 'https:'+channel.avatar_url

            response = requests.get(
                url=url,
                timeout=10
            )
            if not response.headers['Content-Type'].startswith('image/'):
                    channel.avatar_url = default_path
                    channels_list.append(channel)


        except (requests.exceptions.ConnectionError, requests.exceptions.ReadTimeout, requests.exceptions.MissingSchema) as e:
            logger.info(f'{channel.avatar_url=} is to be updated')
            channel.avatar_url=default_path
            channels_list.append(channel)

    if channels_list:
        no = Channel.objects.bulk_update(channels_list, fields=['avatar_url'])
        logger.info(f'Channel ({no}) avatars updated')



def validate_channel_avtar_url(url):
    """Return default url if no invalid image was provided or None"""
    default_path = '/static/custom/default.jpg'
    try:
        if url and url.startswith('//static'):
            """this is url for tgstat images"""
            url = 'https:'+url

        response = requests.get(
            url=url,
            timeout=10
        )
        if not response.headers['Content-Type'].startswith('image/'):
                url = default_path
    except (requests.exceptions.ConnectionError, requests.exceptions.ReadTimeout, requests.exceptions.MissingSchema) as e:
            url=default_path

    return url
