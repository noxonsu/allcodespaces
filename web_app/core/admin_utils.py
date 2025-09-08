from typing import Sequence

from django.contrib import admin

from core.models import ChannelAdmin, Channel, User


class MultipleSelectListFilter(admin.AllValuesFieldListFilter):
    template = "admin/filter_ml.html"


class CustomDateFieldListFilter(admin.DateFieldListFilter):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.display_rename_to = {
            "Дата не указана": "Не опубликовано",
            "Дата указана": "все время",
        }
        self._display_rename_to()

    def _display_rename_to(self):
        links = list(self.links)
        if self.display_rename_to:
            index_ = 0
            for key, value in dict(links).items():
                if key in self.display_rename_to:
                    links[index_] = list(links[index_])
                    links[index_][0] = self.display_rename_to.get(key, links[index_][0])
                    links[index_] = tuple(links[index_])
                index_ += 1
            self.links = tuple(links)


class CustomChoiceFilter(admin.ChoicesFieldListFilter):
    template = "admin/filter_one.html"

class CustomBooleanFilter(admin.BooleanFieldListFilter):
    template = "admin/filter_one.html"



def is_empty(value: str) -> bool:
    """Check if value is empty."""
    return not value or value and value.strip() == ""


def can_change_channel_status(user: User) -> bool:
    """Validate if a certain user can change the channel status."""
    return user and (
        user.is_superuser
        or getattr(user, "profile", None)
        and user.profile.role == ChannelAdmin.Role.MANAGER
    )


def is_not_valid_channel_status(old_status: str, new_status: str) -> bool:
    """check if status is not valid."""
    return new_status and old_status and new_status == Channel.ChannelStatus.PENDING


def remove_fieldset_for_role(
    fieldset: Sequence, fieldset_name: str, channel_admin: ChannelAdmin, role: str
):
    """This function remove a fieldset for a user if he has specific role"""
    fieldset = list(fieldset)
    if channel_admin.role == role and fieldset_name:
        for _i, fields_tuple in enumerate(fieldset):
            if fields_tuple[0] == fieldset_name:
                del fieldset[_i]
                break
    return tuple(fieldset)
