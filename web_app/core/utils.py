from collections import namedtuple
from decimal import Decimal

from django.contrib.auth.models import Permission


def get_property_attr(col, model, attr_name):
    return getattr(getattr(model, col).fget, attr_name)


def budget_cpm(impressions_plan=None, cpm=None):
    return( Decimal(Decimal(impressions_plan / 1000) * cpm).quantize(Decimal('0.01'))
            if cpm and impressions_plan
            else 0
        )

def budget_cpm_from_qs(qs: "QuerySet[CampaignChannel]"):
   total = 0
   for row in qs:
       print(f'{row=}')
       if row.campaign and row.channel:
           print(f'DOG{row=}')
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


