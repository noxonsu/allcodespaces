from django.contrib import admin

from core.models import ChannelAdmin


class MultipleSelectListFilter(admin.AllValuesFieldListFilter):
    template = "admin/filter_ml.html"


class CustomDateFieldListFilter(admin.DateFieldListFilter):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.display_rename_to = {
            "Дата не указана": "Не опубликовано",
            "Дата указана":"все время"
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
                index_+=1
            self.links = tuple(links)


def is_empty(value: str):
    """Check if value is empty."""
    return not value or value and value.strip() == ""


def can_change_channel_status(user):
    """Validate if a certain user can change the channel status."""
    return user and (user.is_superuser or user.profile and user.profile.role == ChannelAdmin.Role.MANAGER)

