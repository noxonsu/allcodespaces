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
    SPONSORSHIP_BUTTON_LIMIT,
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
    autopilot_min_interval = forms.IntegerField(
        required=False,
        min_value=5,
        widget=forms.NumberInput(
            attrs={
                "class": "form-control",
                "min": 5,
                "step": 5,
                "placeholder": "Например, 60",
            }
        ),
        label="Мин. интервал для «Автопилота» (мин)",
        help_text="Канал с форматом «Автопилот» должен указать интервал между публикациями.",
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        instance = kwargs.get("instance") or self.instance
        if instance and instance.pk and instance.supported_formats:
            self.initial.setdefault("supported_formats", instance.supported_formats)
        elif "supported_formats" not in self.initial:
            self.initial["supported_formats"] = default_supported_formats()
        if (
            "autopilot_min_interval" not in self.initial
            and instance
            and instance.autopilot_min_interval
        ):
            self.initial["autopilot_min_interval"] = instance.autopilot_min_interval

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

    def clean(self):
        cleaned_data = super().clean()
        formats = cleaned_data.get("supported_formats") or []
        interval = cleaned_data.get("autopilot_min_interval")
        if PlacementFormat.AUTOPILOT in formats and not interval:
            self.add_error(
                "autopilot_min_interval",
                "Укажите минимальный интервал между публикациями «Автопилота».",
            )
        return cleaned_data

    class Meta:
        model = Channel
        fields = "__all__"


class CampaignAdminForm(forms.ModelForm):
    # CHANGE: Заменил Select на RadioSelect для поля format
    # WHY: Исправление issue #33 - селектор был заблокирован, радиокнопки обеспечивают лучший UX
    # QUOTE(ТЗ): "поменяй селектор 'Формат размещения' на радиобатоны"
    # REF: #33
    format = forms.ChoiceField(
        choices=PlacementFormat.choices,
        required=True,
        initial=PlacementFormat.FIXED_SLOT,
        label="Формат размещения",
        widget=forms.RadioSelect(),
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["message"].queryset = Message.objects.all()
        self.fields["message"].required = True

        format_code = None
        if self.instance and self.instance.pk:
            format_code = self.instance.format
        elif self.data.get("format"):
            format_code = self.data.get("format")
        elif self.initial.get("format"):
            format_code = self.initial.get("format")

        if format_code:
            self.fields["message"].queryset = Message.objects.filter(format=format_code)

        # Блокируем поле format только для существующих кампаний (с сохраненным pk в БД)
        is_existing_campaign = bool(self.instance.pk)

        # Для существующих кампаний блокируем изменение формата
        if is_existing_campaign:
            self.fields["format"].disabled = True
            self.fields["format"].widget.attrs['disabled'] = 'disabled'
        else:
            # Для новых кампаний поле должно быть активным
            self.fields["format"].disabled = False
            self.fields["format"].required = True
            self.fields["format"].initial = PlacementFormat.FIXED_SLOT
            # Явно убираем disabled атрибут и пересоздаем виджет без disabled
            self.fields["format"].widget = forms.RadioSelect(
                attrs={},
                choices=PlacementFormat.choices
            )

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
        queryset=Channel.objects.filter(is_deleted=False),
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
    buttons_json = forms.CharField(
        required=False,
        label="Кнопки",
        widget=forms.Textarea(attrs={"rows": 4, "class": "vLargeTextField"}),
        help_text="Каждая строка: текст | https://example.com. До 8 кнопок.",
    )

    class Meta:
        model = Message
        exclude = ["buttons"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        buttons = getattr(self.instance, "buttons", []) or []
        if buttons:
            self.initial.setdefault(
                "buttons_json",
                "\n".join(f"{btn.get('text','')} | {btn.get('url','')}" for btn in buttons),
            )

    def clean_buttons_json(self):
        value = self.cleaned_data.get("buttons_json", "") or ""
        buttons: list[dict] = []
        for line in value.splitlines():
            line = line.strip()
            if not line:
                continue
            if "|" not in line:
                raise ValidationError("Формат строки: 'Текст | https://url'")
            text, url = map(str.strip, line.split("|", 1))
            if not text or not url:
                raise ValidationError("Укажите текст и URL для кнопки")
            buttons.append({"text": text, "url": url})
        if len(buttons) > 8:
            raise ValidationError("Максимум 8 кнопок")
        return buttons

    def clean(self):
        cleaned_data = super().clean()
        message_format = cleaned_data.get("format")
        body = cleaned_data.get("body") or ""
        buttons = cleaned_data.get("buttons_json", []) or []

        if message_format == PlacementFormat.SPONSORSHIP:
            if len(body) > SPONSORSHIP_BODY_LENGTH_LIMIT:
                self.add_error(
                    "body",
                    f"Для формата «Спонсорство» допустимо до {SPONSORSHIP_BODY_LENGTH_LIMIT} символов.",
                )
            if len(buttons) > SPONSORSHIP_BUTTON_LIMIT:
                self.add_error("buttons_json", "Для формата «Спонсорство» допустима только одна кнопка.")

        if message_format == PlacementFormat.FIXED_SLOT and not buttons:
            self.add_error("buttons_json", "Для формата «Фикс-слот» добавьте хотя бы одну кнопку.")

        cleaned_data["buttons"] = buttons
        return cleaned_data

    def save(self, commit=True):
        instance: Message = super().save(commit=False)
        instance.buttons = self.cleaned_data.get("buttons", [])
        if commit:
            instance.save()
        return instance



class CampaignChannelInlinedForm(forms.ModelForm):
    channel = forms.ModelChoiceField(
        queryset=Channel.objects.filter(is_deleted=False),
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
        campaign: Campaign = self.cleaned_data.get("campaign") or getattr(instance, "campaign", None)
        cpm: Decimal = self.cleaned_data.get("cpm", 0)
        impressions_plan: Decimal = self.cleaned_data.get("impressions_plan", 0)
        budget: Decimal = campaign.budget if campaign else None

        if campaign and campaign.is_draft:
            raise ValidationError("Нельзя изменять каналы у кампании в статусе «Черновик».")

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
                CampaignChannel.objects.filter(
                    campaign=campaign,
                    channel__isnull=False,
                    channel__is_deleted=False,
                )
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
        if channel and channel.is_deleted:
            raise ValidationError({"channel": "Канал помечен как удалён."})
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
