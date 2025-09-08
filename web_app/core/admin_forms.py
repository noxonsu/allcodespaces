from django import forms

from core.admin_utils import is_empty, is_not_valid_channel_status
from core.models import Campaign, Channel, ChannelAdmin, Message
from core.utils import bulk_notify_channeladmin
from web_app.logger import logger


class ChannelForm(forms.ModelForm):
    class Media:
        css = {
            "all": [
                "custom/channelchangeview.css",
            ]
        }

    def clean_status(self):
        status = self.cleaned_data.get("status")
        if "status" in set(self.changed_data) and is_not_valid_channel_status(
            self.initial.get("status"), status
        ):
            self.add_error(
                "status",
                "этот статус не может быть установлен, пожалуйста, выберите другой статус!",
            )
        return status

    class Meta:
        model = Channel
        fields = "__all__"


class CampaignAdminForm(forms.ModelForm):
    def clean_client(self):
        is_new = (
            self.instance
            and not self.instance.created_at
            and not self.instance.updated_at
            and self.instance._state.adding
        )
        client_value = self.cleaned_data.get("client", "")
        if is_new and is_empty(client_value):
            self.add_error("client", "это обязательное поле")
        return client_value

    def clean_budget(self):
        budget = self.cleaned_data.get("budget")
        if budget and budget < 0:
            self.add_error("budget", "Значение не может быть отрицательным")
        return budget

    class Meta:
        model = Campaign
        fields = "__all__"


class ChannelAdminForm(forms.ModelForm):
    channels = forms.ModelMultipleChoiceField(
        queryset=Channel.objects.all(),
        widget=forms.SelectMultiple(attrs={"class": "form-control wide"}),
        required=False,
    )

    class Meta:
        model = ChannelAdmin
        fields = "__all__"

    def clean_channels(self):
        channels = self.cleaned_data.get("channels")
        instance: ChannelAdmin = self.instance
        old_channels = instance.channels.all()
        try:
            added_channels = channels.difference(old_channels)
            rows = [ChannelAdmin.channels.through(channel=add_channel, channeladmin=instance) for add_channel in
                    added_channels]  # making objects in memory after it will be added
            bulk_notify_channeladmin(list_data=rows, roles={ChannelAdmin.Role.OWNER})
        except Exception as e:
            logger.error(f'[ChannelAdminForm] clean_channels {e}')
        return channels


class MessageModelForm(forms.ModelForm):
    button_link = forms.URLField(
        required=True,
        label="Посадочная страница",
        widget=forms.URLInput(attrs={"class": "vTextField vAutocomplete"}),
    )

    class Meta:
        model = Message
        fields = "__all__"
