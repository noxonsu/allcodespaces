from decimal import Decimal

from django import forms
from django.core.exceptions import ValidationError
from django.forms import Select

from core.admin_utils import is_empty, is_not_valid_channel_status
from core.models import (
    Campaign,
    Channel,
    ChannelAdmin,
    Message,
    CampaignChannel,
    ChannelPublicationSlot,
    PlacementFormat,
    SPONSORSHIP_BODY_LENGTH_LIMIT,
    default_supported_formats,
)
from core.utils import bulk_notify_channeladmin, budget_cpm_from_qs
from web_app.logger import logger


class ChannelForm(forms.ModelForm):
    supported_formats = forms.MultipleChoiceField(
        choices=PlacementFormat.choices,
        required=False,
        widget=forms.SelectMultiple(attrs={"class": "form-control wide"}),
        label="Поддерживаемые форматы",
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        instance = kwargs.get("instance") or self.instance
        if instance and instance.pk and instance.supported_formats:
            self.initial.setdefault("supported_formats", instance.supported_formats)
        elif "supported_formats" not in self.initial:
            self.initial["supported_formats"] = default_supported_formats()
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

    def clean_supported_formats(self):
        formats = self.cleaned_data.get("supported_formats") or []
        if not formats:
            return default_supported_formats()
        return formats

    class Meta:
        model = Channel
        fields = "__all__"


class CampaignAdminForm(forms.ModelForm):
    format = forms.ChoiceField(
        choices=PlacementFormat.choices,
        required=True,
        initial=PlacementFormat.FIXED_SLOT,
        label="Формат размещения",
        widget=forms.Select(attrs={"class": "form-control"}),
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["message"].queryset = Message.objects.all()
        self.fields["message"].required = True

        # Блокируем поле format только для существующих кампаний (с сохраненным pk в БД)
        is_existing_campaign = bool(self.instance.pk)

        # Для существующих кампаний блокируем изменение формата
        if is_existing_campaign:
            self.fields["format"].disabled = True
            self.fields["format"].widget.attrs['disabled'] = True
        else:
            # Для новых кампаний поле должно быть активным
            self.fields["format"].disabled = False
            self.fields["format"].required = True
            self.fields["format"].initial = PlacementFormat.FIXED_SLOT
            # Явно убираем disabled атрибут
            self.fields["format"].widget.attrs.pop('disabled', None)

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

    def clean_format(self):
        format_value = self.cleaned_data.get("format")
        if self.instance and self.instance.pk and format_value != self.instance.format:
            self.add_error(
                "format",
                "Нельзя изменять формат существующей кампании.",
            )
        return format_value

    def clean(self):
        cleaned_data = super().clean()
        campaign_format = cleaned_data.get("format")
        message = cleaned_data.get("message")

        if not message:
            self.add_error("message", "Выберите креатив для кампании.")
            return cleaned_data

        if campaign_format and message and message.format != campaign_format:
            self.add_error(
                "message", "Выберите креатив того же формата, что и кампания."
            )

        return cleaned_data

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

    def clean(self):
        cleaned_data = super().clean()
        message_format = cleaned_data.get("format")
        body = cleaned_data.get("body") or ""
        button_text = cleaned_data.get("button_str") or ""
        button_link = cleaned_data.get("button_link")

        if message_format == PlacementFormat.SPONSORSHIP:
            if len(body) > SPONSORSHIP_BODY_LENGTH_LIMIT:
                self.add_error(
                    "body",
                    f"Для формата «Спонсорство» допустимо до {SPONSORSHIP_BODY_LENGTH_LIMIT} символов.",
                )
            if button_text and not button_link:
                self.add_error(
                    "button_link",
                    "Для формата «Спонсорство» ссылка для кнопки обязательна.",
                )
            if button_link and not button_text:
                self.add_error(
                    "button_str",
                    "Для формата «Спонсорство» укажите текст кнопки.",
                )

        return cleaned_data



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
    publication_slot = forms.ModelChoiceField(
        queryset=ChannelPublicationSlot.objects.none(),
        required=False,
        widget=Select(
            attrs={"class": "form-group", "data-channel-slot-select": ""}
        ),
        blank=True,
    )
    cpm = forms.IntegerField(required=False, min_value=0)
    plan_cpm = forms.IntegerField(required=False,  min_value=0)
    impressions_plan = forms.IntegerField(required=False, min_value=0)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        channel_id = None
        if self.instance and getattr(self.instance, "channel_id", None):
            channel_id = self.instance.channel_id
        channel_field = self.add_prefix("channel")
        if self.data and channel_field in self.data:
            data_value = self.data.get(channel_field)
            if data_value:
                channel_id = data_value
        if channel_id:
            self.fields["publication_slot"].queryset = ChannelPublicationSlot.objects.filter(
                channel_id=channel_id
            )
        else:
            self.fields["publication_slot"].queryset = ChannelPublicationSlot.objects.none()

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
        elif instance and budget:
            total_budget = budget_cpm_from_qs(
                CampaignChannel.objects.filter(campaign=campaign, channel__isnull=False)
            )
            total_budget+=current_total_budget
            if total_budget > budget:
                raise ValidationError(
                    {
                        "cpm": "Суммарный бюджет каналов больше чем указанный бюджет кампании"
                    }
                )

        channel = self.cleaned_data.get("channel")
        channel_admin = self.cleaned_data.get("channel_admin")
        publication_slot = self.cleaned_data.get("publication_slot")
        required_fields = ['cpm', 'plan_cpm', 'impressions_plan']
        if campaign and channel and not channel.supports_format(campaign.format):
            raise ValidationError(
                {"channel": "Выберите канал, поддерживающий формат кампании."}
            )
        if channel and channel_admin:
            for field in required_fields:
                if self.cleaned_data.get(field) is None:
                    raise ValidationError({field: "обязательное поле"})
        if campaign and campaign.format == PlacementFormat.FIXED_SLOT:
            if not publication_slot:
                raise ValidationError({"publication_slot": "Выберите слот публикации"})
            if channel and publication_slot.channel_id != channel.id:
                raise ValidationError(
                    {"publication_slot": "Слот принадлежит другому каналу"}
                )
        else:
            self.cleaned_data["publication_slot"] = None
        return super().clean()


class ChannelPublicationSlotInlineForm(forms.ModelForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Add visual grouping for time slots
        if 'start_time' in self.fields:
            self.fields['start_time'].widget.attrs.update({'class': 'time-slot-input'})
        if 'end_time' in self.fields:
            self.fields['end_time'].widget.attrs.update({'class': 'time-slot-input'})
        if 'weekday' in self.fields:
            self.fields['weekday'].widget.attrs.update({'class': 'weekday-select'})

    class Meta:
        model = ChannelPublicationSlot
        fields = "__all__"


class ChannelPublicationSlotInlineFormset(forms.BaseInlineFormSet):
    def clean(self):
        super().clean()
        slots = []
        for form in self.forms:
            if not hasattr(form, "cleaned_data"):
                continue
            data = form.cleaned_data
            # Skip empty forms and forms marked for deletion
            if not data or data.get("DELETE") or not data.get("channel"):
                continue
            weekday = data.get("weekday")
            start_time = data.get("start_time")
            end_time = data.get("end_time")
            # Skip forms with incomplete data
            if weekday is None or start_time is None or end_time is None:
                continue
            # Check for overlapping slots
            # Slots are considered overlapping if they share any time period
            # Adjacent slots (e.g., 8:00-9:00 and 9:00-10:00) are NOT overlapping
            for existing_weekday, existing_start, existing_end in slots:
                if weekday == existing_weekday:
                    # Check if slots actually overlap (not just touch at boundaries)
                    if start_time < existing_end and end_time > existing_start:
                        raise ValidationError(
                            "Нельзя создавать пересекающиеся временные слоты для одного дня недели."
                        )
            slots.append((weekday, start_time, end_time))
