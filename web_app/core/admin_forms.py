from decimal import Decimal

from django import forms
from django.core.exceptions import ValidationError
from django.forms import Select

from core.admin_utils import is_empty, is_not_valid_channel_status
from core.models import Campaign, Channel, ChannelAdmin, Message, CampaignChannel
from core.utils import bulk_notify_channeladmin, budget_cpm_from_qs
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



class CampaignChannelInlinedForm(forms.ModelForm):
    channel = forms.ModelChoiceField(
        queryset=Channel.objects.all(),
        widget=Select(
            attrs={"class": "form-group", "data-channel-select": ""},
        ),
        required=False,
        blank=True
    )
    channel_admin = forms.ModelChoiceField(
        queryset=ChannelAdmin.objects.all(),
        widget=Select(
            attrs={"class": "form-group", "data-channel_admin-select": ""},
        ),
        required=False,
        blank=True
    )
    cpm = forms.IntegerField(required=False, min_value=0)
    plan_cpm = forms.IntegerField(required=False,  min_value=0)
    impressions_plan = forms.IntegerField(required=False, min_value=0)

    class Meta:
        model = CampaignChannel
        fields = "__all__"

    def clean(self):
        from core.utils import budget_cpm
        instance: CampaignChannel = self.instance
        campaign: Campaign = self.cleaned_data.get("campaign")
        cpm: Decimal = self.cleaned_data.get("cpm", 0)
        impressions_plan: Decimal = self.cleaned_data.get("impressions_plan", 0)
        budget: Decimal = campaign.budget

        if not budget:
            raise ValidationError("бюджет обязательное поле")

        current_total_budget = budget_cpm(cpm=cpm, impressions_plan=impressions_plan)
        if not campaign or (campaign and not campaign.id):
            if current_total_budget > budget:
                raise ValidationError(
                    {
                        "cpm": "Суммарный бюджет каналов больше чем указанный бюджет кампании"
                    }
                )
        elif instance and campaign.budget:
            total_budget = budget_cpm_from_qs(
                CampaignChannel.objects.filter(campaign=campaign, channel__isnull=False)
            )
            total_budget += current_total_budget
            if total_budget > campaign.budget:
                raise ValidationError(
                    {
                        "cpm": "Суммарный бюджет каналов больше чем указанный бюджет кампании"
                    }
                )

        channel = self.cleaned_data.get("channel")
        channel_admin = self.cleaned_data.get("channel_admin")
        required_fields = ['cpm', 'plan_cpm', 'impressions_plan']
        if channel and channel_admin:
            for field in required_fields:
                if not self.cleaned_data.get(field):
                    raise ValidationError({field: "обязательное поле"})
        return super().clean()

