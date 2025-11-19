import csv
from decimal import Decimal
try:
    from typing import Self  # type: ignore
except ImportError:
    from typing_extensions import Self
from typing import Optional

from django import forms
from django.contrib import admin, messages
from django.contrib.auth import login, logout
from django.contrib.auth.admin import UserAdmin
from django.core.exceptions import ValidationError
from django.db.models import Sum, QuerySet, Q
from django.forms import Select
from django.http import JsonResponse, FileResponse, HttpResponseRedirect, HttpResponse
from django.urls import path, reverse
from django.utils.safestring import mark_safe
from django.utils.html import format_html

from web_app.logger import logger
from core.ledger_service import DoubleEntryLedgerService as BalanceService, ChannelBalance
from .admin_forms import (
    CampaignAdminForm,
    ChannelAdminForm,
    ChannelForm,
    MessageModelForm, CampaignChannelInlinedForm, ChannelPublicationSlotInlineForm, ChannelPublicationSlotInlineFormset,
)
from .admin_utils import (
    CustomDateFieldListFilter,
    can_change_channel_status, CustomChoiceFilter, CustomBooleanFilter, CustomAllValuesFieldListFilter,
    CustomRelatedFilterListFilter,
)
from .exporter import QuerySetExporter
from .external_clients import TGStatClient
from .models import (
    Channel,
    Campaign,
    Message,
    CampaignChannel,
    User,
    ChannelAdmin,
    ChannelPublicationSlot,
    PlacementFormat,
    MessagePreviewToken,
    UserLoginToken,
    LegalEntity,
    ChannelTransaction,
    Payout,
    PublicationRequest,
)
from django.contrib.admin import register, ModelAdmin

from .utils import budget_cpm_from_qs,  bulk_notify_channeladmin
from .services import BalanceService, ChannelBalance


class ChannelAdminInlinedForm(forms.ModelForm):
    channeladmin = forms.ModelChoiceField(
        queryset=ChannelAdmin.objects.all(),
        widget=Select(
            attrs={"class": "form-control wide", "data-channel_admin-select": ""}
        ),
        required=False,
    )
    chat_room = forms.CharField(
        required=False,
        disabled=True,
        widget=forms.TextInput(attrs={"class": "chat_room"}),
    )

    class Meta:
        model = Channel.admins.through
        fields = "__all__"
        labels = {"channeladmin": "Имя", "chat_room": "Переписка"}

    class Media:
        js = {"custom/channel_admin_inlined.js"}


class ChannelAdminInlined(admin.TabularInline):
    class Media:
        js = ["core/js/channel/inlines/channel_admin_inlined.js"]

    form = ChannelAdminInlinedForm
    model = Channel.admins.through
    extra = 1
    max_num = 10
    verbose_name_plural = "Администраторы"
    verbose_name = "Администраторы"
    template = "admin/core/channel/channel_admin_tab_inlined.html"

    def get_queryset(self, request):
        resolver_match = request.resolver_match
        if resolver_match and getattr(resolver_match, "kwargs"):
            object_id = resolver_match.kwargs.get("object_id")
            return Channel.admins.through.objects.filter(channel__id=object_id)
        return super().get_queryset(request)

    def has_change_permission(self, request, obj=None):
        return False


class ChannelPublicationSlotInline(admin.TabularInline):
    model = ChannelPublicationSlot
    form = ChannelPublicationSlotInlineForm
    formset = ChannelPublicationSlotInlineFormset
    extra = 0
    verbose_name = "Доступный слот"
    verbose_name_plural = "Доступные слоты"
    fields = ["weekday", "start_time", "end_time"]
    template = "admin/core/channel/publication_slots_inline.html"

    def get_extra(self, request, obj=None, **kwargs):
        """No extra forms by default since we use visual grid"""
        return 0

    def get_formset(self, request, obj=None, **kwargs):
        formset = super().get_formset(request, obj, **kwargs)
        # Pass hours and days to template context
        formset.hours = range(0, 24)
        formset.days = range(7)
        return formset


class ChannelTransactionInline(admin.TabularInline):
    """
    CHANGE: Added inline for transactions in Channel admin
    WHY: QA bug fix - show transaction details in channel card
    QUOTE(QA): "В карточке канала не видно операций"
    REF: issue #21 (QA report from TamaraV16)
    """
    model = ChannelTransaction
    fields = [
        "transaction_type",
        "amount",
        "currency",
        "description",
        "created_at",
    ]
    readonly_fields = ["transaction_type", "amount", "currency", "description", "created_at"]
    extra = 0
    can_delete = False
    verbose_name = "Финансовая операция"
    verbose_name_plural = "История операций"
    ordering = ["-created_at"]

    def has_add_permission(self, request, obj=None):
        # Transactions should be added through separate admin, not inline
        return False

    def has_change_permission(self, request, obj=None):
        # Append-only ledger - no editing
        return False


@register(Channel)
class ChannelModelAdmin(admin.ModelAdmin):
    class Media:
        js = ["core/js/admin_channel_model.js", "core/js/channel/tab_navigation.js"]

    readonly_fields = [
        "country",
        "category",
        "name",
        "members_count",
        "avg_posts_reach",
        "username",
        "er",
        "err",
        "err_24",
        "posts_count",
        "daily_reach",
        "about",
        "language",
        "id",
        "tg_id",
        "is_bot_installed",
        "avatar_image",
        "invitation_link_display",
        "invitation_link",
        "refresh_statistics",
        "btn_link_statistics",
        "balance_amount",
        "frozen_amount",
        "available_amount",
    ]
    list_display = [
        "avatar_image",
        "name_str",
        "legal_entity_display",
        "invitation_link_display",
        "members_count",
        "category",
        "is_bot_installed_html",
        "is_deleted",
        "status_html",
        "auto_approve_publications",
        "autopilot_min_interval",
        "balance_amount",
        "frozen_amount",
        "available_amount",
        "avg_posts_reach",
        "cpm",
        "er",
        "err",
        "err_24",
    ]
    inlines = [ChannelAdminInlined, ChannelPublicationSlotInline, ChannelTransactionInline]
    ordering = ["-created_at"]
    list_filter = [
        ("name",CustomAllValuesFieldListFilter),
        ("status", CustomChoiceFilter),
        ("is_bot_installed", CustomBooleanFilter),
        ("legal_entity", CustomRelatedFilterListFilter),
        ("auto_approve_publications", CustomBooleanFilter),
    ]
    list_display_links = ['name_str']
    empty_value_display = "-"
    fieldsets = (
        (
            "Общие",
            {
                "classes": ["wide"],
                "fields": (
                    "avatar_image",
                    "name",
                    "id",
                    "is_bot_installed",
                    "is_deleted",
                    "status",
                    "legal_entity",
                    "cpm",
                    "supported_formats",
                    "auto_approve_publications",
                    "autopilot_min_interval",
                    "btn_link_statistics",
                ),
            },
        ),
        (
            "Финансы",
            {
                "fields": (
                    "balance_amount",
                    "frozen_amount",
                    "available_amount",
                )
            },
        ),
        (
            "Статистика",
            {
                "fields": (
                    "tg_id",
                    "country",
                    "category",
                    "members_count",
                    "avg_posts_reach",
                    "username",
                    "er",
                    "err",
                    "err_24",
                    "posts_count",
                    "daily_reach",
                    "about",
                    "language",
                    "invitation_link",
                    "refresh_statistics",
                )
            },
        ),
    )
    form = ChannelForm


    def changeform_view(self, request, object_id=None, form_url="", extra_context=None):
        """To hide the save and continue btn, add error details, and pass tab context"""
        extra_context = {} if not extra_context else extra_context
        extra_context["show_save_and_continue"] = False
        extra_context["hours"] = range(0, 24)
        extra_context["days"] = range(7)

        response = super().changeform_view(request, object_id, form_url, extra_context=extra_context)

        # If POST and there are errors, show detailed error info
        if request.method == 'POST' and hasattr(response, 'context_data'):
            context = response.context_data
            if context:
                adminform = context.get('adminform')
                inline_admin_formsets = context.get('inline_admin_formsets', [])

                # Collect all errors
                errors = []

                # Main form errors
                if adminform and hasattr(adminform, 'form') and adminform.form.errors:
                    for field, error_list in adminform.form.errors.items():
                        errors.append(f"Поле '{field}': {', '.join(error_list)}")

                # Inline formset errors
                for inline_formset in inline_admin_formsets:
                    if hasattr(inline_formset, 'formset'):
                        formset = inline_formset.formset

                        # Non-form errors
                        if formset.non_form_errors():
                            for error in formset.non_form_errors():
                                errors.append(f"[{inline_formset.opts.verbose_name_plural}] {error}")

                        # Individual form errors
                        for i, form in enumerate(formset.forms):
                            if form.errors:
                                for field, error_list in form.errors.items():
                                    errors.append(f"[{inline_formset.opts.verbose_name_plural}] Форма #{i+1}, поле '{field}': {', '.join(error_list)}")

                # Display errors as warning messages
                if errors:
                    from django.contrib import messages
                    messages.warning(request, "Найдены ошибки валидации:")
                    for error in errors[:10]:  # Limit to 10 errors
                        messages.error(request, error)
                    if len(errors) > 10:
                        messages.error(request, f"... и еще {len(errors) - 10} ошибок")

        return response

    def response_change(self, request, obj):
        """Stay on the same page after save, preserve tab parameter"""
        from django.http import HttpResponseRedirect
        from django.urls import reverse

        # Check if this is a save action (not save and continue)
        if "_save" in request.POST:
            msg = f'Канал "{obj}" успешно сохранен.'
            self.message_user(request, msg)

            # Preserve tab parameter if present
            redirect_url = request.path
            tab_param = request.GET.get('tab')
            if tab_param:
                redirect_url += f'?tab={tab_param}'

            return HttpResponseRedirect(redirect_url)

        # For other actions, use default behavior
        return super().response_change(request, obj)

    def formfield_for_dbfield(self, db_field, **kwargs):
        """Modify formfields for change/add"""
        form_field = super().formfield_for_dbfield(db_field, **kwargs)
        try:
            if db_field.name == "status":
                form_field.disabled = True
                request = kwargs.get("request")
                if request and can_change_channel_status(request.user):
                    form_field.disabled = False
                return form_field
        except Exception:
            form_field.disabled = False
            pass
        finally:
            return form_field

    def save_related(self, request, form, formsets, change):
        """Notify a ChannelAdmin that he was added to a channel"""

        res =  super().save_related(request, form, formsets, change)
        for row in formsets:
            new_objects = row.new_objects
            if new_objects:
                bulk_notify_channeladmin(new_objects, roles={ChannelAdmin.Role.OWNER})

        return res

    @admin.display(description="Статистика по кампаниям")
    def btn_link_statistics(self, instance: Channel):
        btn_htmlstr = (
            f'<a class="btn btn-info" href="/admin/core/campaignchannel/?channel__id__exact={instance.id}">Перейти &#128202;</a>'
            if instance
            else "&#10060;"
        )
        return mark_safe(btn_htmlstr)

    @staticmethod
    def _format_money(value: Decimal) -> str:
        return f"{value.quantize(Decimal('0.01'))} ₽"

    def _get_balance(self, instance: Channel) -> ChannelBalance:
        cached = getattr(instance, "_balance_cache", None)
        if cached:
            return cached

        balance = BalanceService.calculate_balance(instance)
        setattr(instance, "_balance_cache", balance)
        return balance

    @admin.display(description="Баланс, ₽")
    def balance_amount(self, instance: Channel) -> str:
        return self._format_money(self._get_balance(instance).balance)

    @admin.display(description="Заморожено, ₽")
    def frozen_amount(self, instance: Channel) -> str:
        return self._format_money(self._get_balance(instance).frozen)

    @admin.display(description="Доступно, ₽")
    def available_amount(self, instance: Channel) -> str:
        return self._format_money(self._get_balance(instance).available)

    @admin.display(description="Бот", ordering='is_bot_installed', boolean=True)
    def is_bot_installed_html(self, instance: Channel):
        return instance.is_bot_installed

    @admin.display(description="Название", ordering="name")
    def name_str(self, instance: Channel) -> str:
        tooltip_attrs = ""
        if not instance.admins.exists():
            tooltip_attrs = (
                """class='tooltip-channel' title='нет админов в этом канале' """
            )
        htm_str = "<span {}>{instance.name}</span>".format(
            tooltip_attrs, instance=instance
        )
        return mark_safe(htm_str)

    @admin.display(description="Юрлицо", ordering="legal_entity__short_name")
    def legal_entity_display(self, instance: Channel):
        """
        CHANGE: Display legal entity for channel in admin list
        WHY: Required by ТЗ 1.2.2 - show legal entity binding
        REF: issue #25
        """
        if instance.legal_entity:
            return instance.legal_entity.short_name or instance.legal_entity.name
        return "-"

    @admin.display(description="")
    def refresh_statistics(self, obj: Channel):
        client = TGStatClient()
        client.update_channel_info(obj)
        client.update_channel_stat(obj)
        return mark_safe(
            '<a href="" class="btn btn-success">обновить статистику &#128201;</a>'
        )

    def has_view_permission(self, request, obj=None):
        if obj and obj.is_deleted and not request.user.is_superuser:
            return False
        return True

    def has_change_permission(self, request, obj=None):
        if obj and obj.is_deleted and not request.user.is_superuser:
            return False
        return super().has_change_permission(request, obj)

    def get_readonly_fields(self, request, obj=None):
        readonly_fields = super().get_readonly_fields(request, obj)
        if request.user.is_superuser:
            return readonly_fields
        return [*readonly_fields, "is_deleted"]

    def _remove_changelist_delete_obj(self, actions_dict):
        if "delete_selected" in actions_dict:
            del actions_dict["delete_selected"]

    def get_actions(self, request):
        response = super().get_actions(request)
        self._remove_changelist_delete_obj(response)
        return response

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        user = request.user
        channel_admin = getattr(user, "profile", None)
        if not request.user.is_superuser:
            qs = qs.filter(is_deleted=False)
        if channel_admin and channel_admin.role == ChannelAdmin.Role.OWNER:
            return qs.filter(admins__id=channel_admin.id)
        return qs

    def get_list_filter(self, request):
        filters = super().get_list_filter(request)
        if request.user.is_superuser:
            return [*filters, ("is_deleted", CustomBooleanFilter)]
        return filters

    def has_add_permission(self, request):
        return False

    @admin.display(description="")
    def avatar_image(self, obj):
        img_template = "<img class='img-circle float-left'  src={} alt='image-{}' style='width:80px;height:80px;'>"
        img_html = img_template.format('/static/custom/default.jpg', obj.name)
        if obj.avatar_url:
            img_html = img_template.format(obj.avatar_url, obj.name)
        return mark_safe(img_html)

    @admin.display(description="Модерация", ordering="-status")
    def status_html(self, obj: Channel):
        return Channel.ChannelStatus(obj.status).to_html()

    @admin.display(description='')
    def invitation_link_display(self, ob: Channel):
        return mark_safe(f'<a target="_blank" href="{ob.invitation_link}"><i class="fab fa-telegram-plane blue-color" style="font-size: 40px"></i></a>')

    def get_urls(self):
        urls = super().get_urls()
        urls.append(
            path(
                "<uuid:object_id>/channel-admins-list",
                self.admin_site.admin_view(self.filter_channel_admin_inlined),
            ),
        )
        urls.append(
        path(
            "<uuid:object_id>/channel-cpm-get",
            self.admin_site.admin_view(self.get_channel_cpm_inlined)))
        urls.append(
            path(
                "<uuid:object_id>/publication-slots",
                self.admin_site.admin_view(self.get_channel_publication_slots),
            )
        )

        return urls

    def filter_channel_admin_inlined(self, request, object_id):
        admins = map(
            lambda x: {"id": str(x.id), "text": str(x), "disabled": True},
            ChannelAdmin.objects.filter(channels__id=object_id),
        )
        data = list(admins)
        if data:
            data[0].update({"selected": "selected"})
        return JsonResponse(data=data, safe=False)

    def get_channel_cpm_inlined(self, request, object_id):
        """Get Cpm for inlined camoagin channel inlined"""
        channel = Channel.objects.filter(id=object_id).first()
        data = dict(value=0)
        if channel:
            data['value'] = channel.cpm or 0
        return JsonResponse(data=data)

    def get_channel_publication_slots(self, request, object_id):
        slots = ChannelPublicationSlot.objects.filter(channel_id=object_id).order_by(
            "weekday", "start_time"
        )
        data = [
            {
                "id": str(slot.id),
                "text": slot.label,
            }
            for slot in slots
        ]
        return JsonResponse(data, safe=False)


class CampaignChannelInlined(admin.TabularInline):
    """CampaignChannel in campaign model admin"""
    class Media:
        js = {"custom/campaign_channel_inlined.js"}

    model = CampaignChannel
    readonly_fields = [
        "impressions_fact",
        "message_publish_date",
        "channel_invitation_link",
        "channel_post_id",
        "publish_status",
        "clicks",
        "update_statistics",
        "cpm_diff",
        "ctr",
        "budget",
    ]
    fields = [
        'channel',
        'channel_invitation_link',
        'channel_admin',
        'publication_slot',
        'cpm',
        'plan_cpm',
        'cpm_diff',
        'impressions_plan',
        'impressions_fact',
        'clicks',
        'ctr',
        'budget',
        'publish_status',
        'message_publish_date',
        'channel_post_id',
        'update_statistics',
    ]
    extra = 1
    verbose_name = "Канал"
    verbose_name_plural = "Каналы"
    form = CampaignChannelInlinedForm
    template = "admin/core/campaign/campaign_channel_tabular.html"

    def _get_campaign_format(self, request) -> Optional[str]:
        if not request:
            return None
        resolver_match = getattr(request, "resolver_match", None)
        if resolver_match and getattr(resolver_match, "kwargs", None):
            object_id = resolver_match.kwargs.get("object_id")
            if object_id:
                campaign = Campaign.objects.filter(id=object_id).first()
                if campaign:
                    return campaign.format
        format_code = None
        if request.POST:
            format_code = request.POST.get("format")
        if not format_code and request.GET:
            format_code = request.GET.get("format")
        valid_values = {choice[0] for choice in PlacementFormat.choices}
        if format_code in valid_values:
            return format_code
        return None

    def formfield_for_foreignkey(self, db_field, request=None, **kwargs):
        if db_field.name == "channel":
            campaign_format = self._get_campaign_format(request)
            if campaign_format:
                kwargs["queryset"] = Channel.objects.filter(
                    supported_formats__contains=[campaign_format],
                    is_deleted=False,
                )
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    @admin.display(description="Обновить статистику")
    def update_statistics(self, instance):
        if not instance._state.adding:
            from core.tasks import update_campaign_channel_views

            update_campaign_channel_views.delay(campaign_channel_id=instance.id)
            logger.info("[Task](update_campaign_channel_views) started from admin")
            return mark_safe(
                '<a href="" class="btn btn-success">Обновить статистику </a>'
            )
        else:
            return "-"

    @admin.display(description="Ссылка на канал в ТГ")
    def channel_invitation_link(self, instance):
        return mark_safe(f'<a target="_blank" href="{instance.channel.invitation_link}">'
                         f'<i class="fab fa-telegram-plane blue-color" style="font-size: 40px"></i>'
                         f'</a>') if getattr(instance, "channel", None) else "-"

    @admin.display(description='Разница')
    def cpm_diff(self, instance):
        val= round(instance.cpm_diff,2) if instance.cpm_diff else 0
        return f'{val} %'

    @admin.display(description='Бюджет')
    def budget(self, instance):
        return round(instance.budget,2) if instance.budget else 0

    def has_change_permission(self, request, obj=None):
        return False

    def has_add_permission(self, request, obj):
        if obj and obj.is_draft:
            return False
        if request and request.POST.get("status") == Campaign.Statuses.DRAFT:
            return False
        return super().has_add_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        if obj and obj.is_draft:
            return False
        return super().has_delete_permission(request, obj)

    def get_extra(self, request, obj=None, **kwargs):
        if obj and obj.is_draft:
            return 0
        return super().get_extra(request, obj=obj, **kwargs)

    def get_max_num(self, request, obj=None, **kwargs):
        if obj and obj.is_draft:
            return 0
        return super().get_max_num(request, obj=obj, **kwargs)


class ReadOnlyCampaignChannelInlined(admin.TabularInline):
    def has_add_permission(self, request, obj):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    template = "admin/core/campaign/campaign_channels.html"

    extra = 0
    model = CampaignChannel
    verbose_name_plural = "Прогноз"
    verbose_name = "Прогноз"
    fields = [
        "campaign_channels_count",
        "campaign_channels_subs_count",
        "channels_avg_posts_reach",
        "publication_slot_display",
        "sov",
    ]
    readonly_fields = fields

    # to delete
    @admin.display(description="Количество каналов")
    def campaign_channels_count(self: Self, instance: CampaignChannel):
        campaign: Campaign = instance.campaign
        return campaign.active_channels.count()

    @admin.display(description="Ёмкость каналов")
    def campaign_channels_subs_count(self: Self, instance: CampaignChannel):
        # has no effect to do refactor, values are hardcoded in template getting from object campaign
        return Channel.objects.filter(channel_campaigns=instance.id, is_deleted=False).aggregate(
            Sum("members_count")
        )["members_count__sum"]

    @admin.display(description="Ёмкость рекл.поста")
    def channels_avg_posts_reach(
        self: Self, instance: CampaignChannel
    ):  # has no effect
        # has no effect to do refactor, values are hardcoded in template getting from object campaign
        return instance.campaign.campaigns_channel.aggreget(Sum("avg_posts_reach"))[
            "avg_posts_reach__sum"
        ]

    @admin.display(description="SOV")
    def sov(self, instance: CampaignChannel):
        # has no effect to do refactor, values are hardcoded in template getting from object campaign
        campaign = instance.campaign
        subs_count = instance.campaign_channels_subs_count()
        total_impressions_plan = campaign.campaign_channels.aggregate(
            sum=Sum("impressions_fact")
        )["sum"]
        return f"{total_impressions_plan / subs_count:.0%}"

    @admin.display(description="Слот публикации")
    def publication_slot_display(self, instance: CampaignChannel):
        slot = getattr(instance, "publication_slot", None)
        return slot.label if slot else "-"


@register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    class Media:
        css = {"all": ["core/css/campaign/change_form.css"]}
        js = ['core/js/campaign/change_form.js']

    actions = ["archive_campaigns", "unarchive_campaigns", "generate_media_plan"]
    list_max_show_all = 50
    list_per_page = 20
    readonly_fields = [
        "id",
        "total_planed_views",
        "avg_cpm",
        "link_to_statistics",
    ]
    list_display = [
        "client",
        "brand",
        "link_type",
        "name_str",
        "total_channels",
        "status",
        "format_display",
        "start_date",
        "finish_date",
        "total_planed_views",
        "total_planed_fact",
        "total_views_fact_over_plan",
        "total_clicks",
        "total_ctr",
        "budget",
    ]
    list_filter = [
        ("name", CustomAllValuesFieldListFilter),
        ("brand", CustomAllValuesFieldListFilter),
        ("client", CustomAllValuesFieldListFilter),
        ("status", CustomChoiceFilter),
        ("format", CustomChoiceFilter),
        ("is_archived", CustomBooleanFilter),
        ("start_date",CustomDateFieldListFilter),
        ("finish_date",CustomDateFieldListFilter),
    ]
    fieldsets = (
        (
            "Общие",
            {
                "classes": ["wide"],
                "fields": (
                    "name",
                    "client",
                    "brand",
                    "budget",
                    "format",
                    "start_date",
                    "finish_date",
                    "white_list",
                    "black_list",
                    "status",
                    "is_archived",
                    # "avg_cpm",
                    # "total_planed_views",
                    # "link_to_statistics",
                ),
            },
        ),
        ("Креатив", {"classes": ["wide"], "fields": ("message",)}),
    )
    list_display_links = ['name_str']
    form = CampaignAdminForm
    inlines = [CampaignChannelInlined, ReadOnlyCampaignChannelInlined]

    def get_form(self, request, obj=None, **kwargs):
        """Override to ensure format field is enabled for new campaigns"""
        form = super().get_form(request, obj, **kwargs)
        # Для новых кампаний (obj=None) явно разблокируем поле format
        if obj is None and 'format' in form.base_fields:
            form.base_fields['format'].disabled = False
            form.base_fields['format'].required = True
        return form

    @admin.display(description='Каналы')
    def total_channels(self, instance: Campaign):
        return instance.total_channels_count

    @admin.display(description='ПФ')
    def total_planed_fact(self,  instance: Campaign):
        return instance.total_impressions_fact

    @admin.display(description='%')
    def total_views_fact_over_plan(self,  instance: Campaign):
        val =  instance.total_views_fact_over_plan
        return round(val,2) if val else '-'

    @admin.display(description='Клики')
    def total_clicks(self,  instance: Campaign):
        return instance.total_clicks

    @admin.display(description='CTR')
    def total_ctr(self,  instance: Campaign):
        return instance.total_ctr

    @admin.display(description='Target')
    def link_type(self, instance: Campaign):
        return mark_safe(f"<a href='{instance.message.button_link}'>{instance.link_type_str}</a>")

    @admin.display(description="Формат", ordering="format")
    def format_display(self, instance: Campaign) -> str:
        return instance.get_format_display()

    @admin.display(description="Кампания", ordering="name")
    def name_str(self, obj: Campaign) -> str:
        campaignchannels_count = obj.campaigns_channel.filter(
            publish_status=CampaignChannel.PublishStatusChoices.PUBLISHED,
            channel_post_id__isnull=False,
        ).count()
        htm_str = f"<span>{obj.name}</span>"
        if campaignchannels_count:
            htm_str = f'<span class="tooltip-campaign" title="кол-во опубликованных постов ({campaignchannels_count})">{obj.name}</span>'
        return mark_safe(htm_str)

    @admin.display(description="Статистики")
    def link_to_statistics(self, obj: Campaign) -> str:
        if not obj.pk:
            return "-"
        return mark_safe(
            f'<a class="btn btn-info" href="/admin/core/campaignchannel/?campaign__id__exact={str(obj.id)}">Ссылка на страницу Статистика по РК </a>'
        )

    def _remove_changelist_delete_obj(self, actions_dict):
        del actions_dict["delete_selected"]

    def get_actions(self, request):
        response = super().get_actions(request)
        self._remove_changelist_delete_obj(response)
        return response

    def delete_model(self, request, obj):
        """
        CHANGE: Override delete_model to prevent deletion of campaigns with publications
        WHY: Protect published campaigns from accidental deletion
        REF: issue #42
        """
        from django.contrib import messages
        from django.core.exceptions import ValidationError

        if obj.has_publications():
            messages.error(
                request,
                f"Невозможно удалить кампанию '{obj.name}': имеются опубликованные посты. "
                "Сначала необходимо удалить все публикации или используйте действие «Архивировать».",
            )
            return

        try:
            super().delete_model(request, obj)
        except ValidationError as exc:
            messages.error(
                request,
                f"Невозможно удалить кампанию '{obj.name}': {exc.messages[0]} "
                "Попробуйте действие «Архивировать».",
            )

    def delete_queryset(self, request, queryset):
        """
        CHANGE: Override delete_queryset to prevent deletion of campaigns with publications
        WHY: Protect published campaigns from accidental bulk deletion
        REF: issue #42
        """
        from django.contrib import messages

        campaigns_with_publications = []
        campaigns_to_delete = []

        for campaign in queryset:
            if campaign.has_publications():
                campaigns_with_publications.append(campaign.name)
            else:
                campaigns_to_delete.append(campaign)

        if campaigns_with_publications:
            messages.error(
                request,
                f"Невозможно удалить кампании с публикациями: {', '.join(campaigns_with_publications)}. "
                "Сначала необходимо удалить все публикации или используйте действие «Архивировать».",
            )

        if campaigns_to_delete:
            for campaign in campaigns_to_delete:
                campaign.delete()
            messages.success(
                request,
                f"Успешно удалено кампаний: {len(campaigns_to_delete)}",
            )

    def changeform_view(self, request, object_id=None, form_url="", extra_context=None):
        """To hide the save and continue btn, the history btn is disabled in the template change_form_object_tools.html"""
        extra_context = {} if not extra_context else extra_context
        extra_context["show_save_and_continue"] = False
        extra_context["show_save_and_add_another"] = False
        obj = self.get_object(request, object_id) if object_id else None
        if obj and obj.is_draft:
            messages.warning(
                request,
                "Кампания в статусе «Черновик»: действия с каналами недоступны."
                " Переведите кампанию в активный статус, чтобы планировать публикации.",
            )
            extra_context["is_draft"] = True
        if obj and obj.is_archived:
            messages.info(
                request,
                "Кампания находится в архиве. Добавление новых каналов и публикаций заблокировано. "
                "Используйте действие «Разархивировать», чтобы возобновить работу.",
            )
            extra_context["is_archived"] = True
        return super().changeform_view(request, object_id, extra_context=extra_context)

    def get_queryset(self, request):
        """
        CHANGE: Hide archived campaigns by default
        WHY: Issue #43 - архивные кампании скрыты из дефолтных списков
        REF: #43
        """
        qs = super().get_queryset(request)
        # Показываем архивные только если пользователь явно выбрал фильтр
        if not request.GET.get('is_archived__exact'):
            qs = qs.filter(is_archived=False)
        return qs

    @admin.action(description="Архивировать выбранные кампании")
    def archive_campaigns(self, request, queryset):
        """
        CHANGE: Action to archive campaigns
        WHY: Issue #43 - альтернатива удалению
        REF: #43
        """
        campaigns_with_publications = []
        campaigns_to_archive = []
        already_archived = []

        for campaign in queryset:
            if campaign.is_archived:
                already_archived.append(campaign.name)
                continue
            if campaign.has_publications():
                # Кампании с публикациями можно архивировать
                campaigns_to_archive.append(campaign)
            else:
                campaigns_to_archive.append(campaign)

        if campaigns_to_archive:
            count = len(campaigns_to_archive)
            for campaign in campaigns_to_archive:
                campaign.is_archived = True
                campaign.save()
            messages.success(
                request,
                f"Успешно архивировано кампаний: {count}. Они исчезнут из списка по умолчанию, но доступны через фильтр «Архивирована»."
            )
        elif already_archived:
            messages.info(
                request,
                "Выбранные кампании уже находятся в архиве."
            )

    @admin.action(description="Разархивировать выбранные кампании")
    def unarchive_campaigns(self, request, queryset):
        """
        CHANGE: Action to unarchive campaigns
        WHY: Issue #43 - возможность восстановления из архива
        REF: #43
        """
        count = queryset.filter(is_archived=True).update(is_archived=False)
        if count:
            messages.success(
                request,
                f"Успешно разархивировано кампаний: {count}"
            )

    def generate_media_plan(self, request, queryset):
        """
        CHANGE: Action to generate media plan for selected campaigns
        WHY: Issue #48 - возможность выбора кампаний и генерации медиаплана
        REF: #48
        """
        if queryset.count() == 0:
            messages.error(request, "Не выбрано ни одной кампании")
            return

        campaign_ids = list(queryset.values_list('id', flat=True))

        # Store selected campaign IDs in session for next step (issue #49)
        request.session['media_plan_campaign_ids'] = [str(id) for id in campaign_ids]

        messages.success(
            request,
            f"Выбрано кампаний: {queryset.count()}. Медиаплан будет сгенерирован (функционал в разработке - issue #49)"
        )

    generate_media_plan.short_description = "Сформировать медиаплан"


class MessagePreviewTokenInline(admin.TabularInline):
    """
    Inline для отображения истории предпросмотров креатива.

    CHANGE: Added inline for preview tokens history in Message admin
    WHY: Issue #53 requires preview history to be visible in message admin
    REF: #53
    """
    model = MessagePreviewToken
    extra = 0
    can_delete = False
    readonly_fields = ["token", "created_by", "created_at", "expires_at", "used_at", "status_display"]
    fields = ["created_by", "created_at", "expires_at", "used_at", "status_display"]

    def status_display(self, obj):
        """Display token status with color."""
        if obj.used_at:
            return format_html('<span style="color: green;">✓ Использован</span>')
        elif obj.is_expired:
            return format_html('<span style="color: red;">✗ Истёк</span>')
        else:
            return format_html('<span style="color: blue;">⏳ Активен</span>')
    status_display.short_description = "Статус"

    def has_add_permission(self, request, obj=None):
        return False


@register(Message)
class MessageAdmin(admin.ModelAdmin):
    class Media:
        js = ["core/js/message/change_form.js"]
        css = {"all": ["core/css/message/change_form.css"]}

    readonly_fields = ["id", "display_image", "display_image_thumbil"]
    list_display = [
        "__str__",
        'title_display',
        "message_type",
        "format_display",
        "display_image_thumbil",
    ]
    form = MessageModelForm
    inlines = [MessagePreviewTokenInline]  # CHANGE: Added preview history inline

    fields = [
        "name",
        "title",
        "body",
        "image",
        "video",
        "format",
        "buttons_json",
        "is_external",
        "ad_individual",
        "ad_inn",
        "erid",
        "display_image_thumbil",
        "id",
    ]

    @admin.display(description="Body")
    def message_body(self, obj):
        return obj.body[:15] + "..."

    @admin.display(description="заголовок", ordering='-title', empty_value='-')
    def title_display(self, obj):
        if obj.title and len(obj.title) > 80:
            return obj.title[:80] + "..."
        return obj.title


    @admin.display(description="Displayed Image")
    def display_image(self, obj):
        if obj.image:
            return mark_safe(
                f"<img src={obj.image.url} alt='image-{obj.title}' style='width:70%;height:70%;'>"
            )
        return "-"

    @admin.display(description="Формат", ordering="format")
    def format_display(self, obj: Message) -> str:
        return obj.get_format_display()

    @admin.display(description="миниатюра")
    def display_image_thumbil(self, obj):
        if obj.image:
            text = f'''
            <div class="thumb-container" >
                <a href="{obj.image.url}" data-jbox-image="thumb-image" title="{str(obj.image)}" >
                    <img class="thumb-image" src="{obj.image.url}" alt="миниатюра"> 
                <a>
            </div>'''
            return mark_safe(text)
        return "-"

@register(MessagePreviewToken)
class MessagePreviewTokenAdmin(admin.ModelAdmin):
    list_display = ["token", "message", "created_by", "expires_at", "used_at"]
    readonly_fields = list_display
    search_fields = ["token", "message__name", "message__title"]
    list_filter = ["used_at"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@register(CampaignChannel)
class CampaignChannelAdmin(admin.ModelAdmin):
    list_display = [
        "campaign_link",
        "channel_link",
        "message_publish_date",
        "impressions_plan_col",
        "impressions_fact",
        "clicks",
        "earned_money",
    ]
    list_filter = [
        ("campaign",CustomRelatedFilterListFilter),
        ("channel",CustomRelatedFilterListFilter),
        ("message_publish_date", CustomDateFieldListFilter),
        ("publish_status", CustomChoiceFilter),
    ]
    readonly_fields = [
        "ctr_col",
        "precentage_col",
        "impressions_plan_col",
        "impressions_fact",
        "message_publish_date",
        "channel_post_id",
        "clicks",
        "clicks",
        'campaign_client',
        'campaign_brand',
        'link_target',
        "publish_status",
        "impressions_fact_owner",
    ]

    @admin.display(description='Рекламодатель')
    def campaign_client(self, instance: CampaignChannel):
        return instance.campaign.client

    @admin.display(description='Бренд')
    def campaign_brand(self, instance: CampaignChannel):
        return instance.campaign.brand

    @admin.display(description='Target')
    def link_target(self, instance: CampaignChannel):
        val = f'<a href="{instance.campaign.message.button_link}" target="_blank">{instance.link_type_str}</a>'
        return mark_safe(val)

    @admin.display(description="Показы-план", ordering="impressions_plan")
    def impressions_plan_col(self, obj):
        return obj.impressions_plan if obj.impressions_plan else "-"

    @admin.display(description="CTR", ordering="impressions_fact")
    def ctr_col(self, obj: CampaignChannel):
        return (
            f"{(obj.clicks / obj.impressions_fact) * 100:.2f}%"
            if obj.clicks and obj.impressions_fact
            else "-"
        )

    @admin.display(description="% от плана", ordering="impressions_plan")
    def precentage_col(self, obj):
        return (
            f"{(obj.impressions_fact / obj.impressions_plan) * 100:.2f}%"
            if obj.impressions_plan and obj.impressions_fact
            else "-"
        )

    @admin.display(description="Канал", ordering="channel")
    def channel_link(self, obj):
        return mark_safe(
            f'<a href="/core/channel/{obj.channel.id}/change/"> {obj.channel}</a>'
        )

    @admin.display(description="Название РК", ordering="campaign")
    def campaign_link(self, obj: CampaignChannel):
        return mark_safe(
            f'<a href="/core/campaign/{obj.campaign.id}/change/"> {obj.campaign}</a>'
        )

    @admin.display(description='')
    def channel_tg_link(self, instance: CampaignChannel):
        return mark_safe(f'<a target="_blank" href="{instance.channel.invitation_link}"><i class="fab fa-telegram-plane blue-color" style="font-size: 40px"></i></a>')

    @admin.display(description='Старт')
    def start_date(self, instance):
        return instance.campaign.start_date

    @admin.display(description='Стоп')
    def finish_date(self, instance):
        return instance.campaign.finish_date

    @admin.display(description="Показы", ordering="impressions_fact")
    def impressions_fact_owner(self, obj):
        return obj.impressions_fact if obj.impressions_fact else "-"

    def _remove_changelist_delete_obj(self, actions_dict):
        if "delete_selected" in actions_dict:
            del actions_dict["delete_selected"]

    def get_actions(self, request):
        response = super().get_actions(request)
        self._remove_changelist_delete_obj(response)
        return response

    def export_to_xlsx(self, request):
        self.message_user(request, "Выгрузка в excel запущено")
        cols = [
            "campaign",
            "channel",
            "message_publish_date",
            "impressions_fact",
            "clicks",
            "earned_money",
            "publish_status",
        ]
        queryset = self.get_queryset(request)
        data_buffer = QuerySetExporter(
            data=queryset, format="xlsx", cols=cols, for_user=request.user
        ).process()
        return FileResponse(
            data_buffer,
            filename="export.xlsx",
            as_attachment=True,
            content_type="application/vnd.ms-excel",
            charset="utf-8",
        )

    def get_urls(self):
        urls = super().get_urls()
        urls.append(
            path("export-xlsx", self.admin_site.admin_view(self.export_to_xlsx))
        )
        return urls

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        user = request.user
        channel_admin = ChannelAdmin.objects.filter(user=user).first()
        if channel_admin and user.groups.filter(name__in=["owner", "owners"]).exists() or user.is_owner:
            return self._get_owner_qs(request, qs=qs, channel_admin=channel_admin)
        return qs

    def get_changelist_instance(self, request):
        res = super().get_changelist_instance(request)
        res.show_text = getattr(self, 'show_text', False)
        res.show_card = getattr(self, 'show_card', False)
        return res

    def _get_owner_qs(self,  request, *args, **kwargs):
        qs: QuerySet[CampaignChannel]  = kwargs.get('qs', super().get_queryset(request))
        channel_admin = kwargs['channel_admin']

        channels = ChannelAdmin.objects.channels_by_status(channel_admin.id, Channel.ChannelStatus.CONFIRMED)
        if not channels.exists():
            self.show_card = True
            self.show_text = False
            return qs.none()

        if not CampaignChannel.objects.admin_channel_status_qs(channel_admin.id, Channel.ChannelStatus.CONFIRMED).exists():
            self.show_card = False
            self.show_text = True
            return qs.none()

        return qs.filter(channel_admin=channel_admin, channel__in=channels.all())

    def get_list_display(self, request):
        response = super().get_list_display(request).copy()
        user = request.user
        if user.groups.filter(name__in=["owner", "owners"]):
            fields = [
                'campaign_client',
                'campaign_brand',
                'link_target',
                'campaign',
                'channel_link',
                'channel_tg_link',
                'publish_status',
                'start_date',
                'finish_date',
                'impressions_fact',
                'clicks',
                'earned_money',
            ]
            return fields
        return response

    def get_list_filter(self, request):
        response = super().get_list_filter(request).copy()
        user = request.user
        if user.groups.filter(name__in=["owners", "owner"]) and 'campaign' in response:
            response.remove("campaign")  # remove first col
            return response
        return response

    def has_add_permission(self, request):
        return False


@register(User)
class UserAdmin(UserAdmin):
    """
    CHANGE: Добавлена колонка login_as_link и метод генерации токенов
    WHY: Позволить суперадминам входить под другими пользователями через временный токен
    REF: User request
    """
    actions = []
    list_display = (
        'username', 'email', 'first_name', 'last_name', 'is_superuser', 'is_staff', 'login_as_link'
    )

    @admin.display(description='Войти под юзером')
    def login_as_link(self, obj):
        """
        CHANGE: Показывает confirm с ссылкой вместо прямого перехода
        WHY: Пользователь хочет сам копировать ссылку и входить отдельно
        REF: User request
        """
        if not obj or obj.is_superuser:
            return "-"

        # Генерируем уникальный токен
        import secrets
        from datetime import timedelta
        from django.utils import timezone

        token_value = secrets.token_urlsafe(32)
        expires_at = timezone.now() + timedelta(hours=24)

        # Создаем токен
        token_instance = UserLoginToken.objects.create(
            user=obj,
            token=token_value,
            expires_at=expires_at,
            created_by=None  # request.user не доступен в list_display
        )

        # Генерируем полную ссылку
        login_url = f"https://telewin.wpmix.net/login-as-user/?token={token_value}"

        # JavaScript для показа confirm со ссылкой
        js_code = f"""
        onclick="event.preventDefault();
        var url = '{login_url}';
        if (confirm('Ссылка для входа под пользователем {obj.username}:\\n\\n' + url + '\\n\\nСкопируйте ссылку и откройте в другом браузере.\\n\\nОткрыть сейчас?')) {{
            navigator.clipboard.writeText(url).then(function() {{
                alert('Ссылка скопирована в буфер обмена!');
                window.open(url, '_blank');
            }}).catch(function() {{
                window.open(url, '_blank');
            }});
        }} else {{
            navigator.clipboard.writeText(url).then(function() {{
                alert('Ссылка скопирована в буфер обмена!');
            }});
        }}
        return false;"
        """

        return mark_safe(
            f'<button {js_code} class="btn btn-info" style="cursor: pointer;">Войти под {obj.username}</button>'
        )


class LegalEntityChannelInline(admin.TabularInline):
    model = Channel
    fields = [
        "name",
        "status",
        "members_count",
        "balance_amount",
        "frozen_amount",
        "available_amount",
    ]
    readonly_fields = fields
    extra = 0
    can_delete = False
    verbose_name = "Канал"
    verbose_name_plural = "Каналы"

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.select_related("legal_entity")

    @staticmethod
    def _format_money(value: Decimal) -> str:
        return f"{value.quantize(Decimal('0.01'))} ₽"

    def _get_balance(self, instance: Channel) -> ChannelBalance:
        cached = getattr(instance, "_balance_cache", None)
        if cached:
            return cached

        balance = BalanceService.calculate_balance(instance)
        setattr(instance, "_balance_cache", balance)
        return balance

    def balance_amount(self, instance: Channel) -> str:
        return self._format_money(self._get_balance(instance).balance)

    def frozen_amount(self, instance: Channel) -> str:
        return self._format_money(self._get_balance(instance).frozen)

    def available_amount(self, instance: Channel) -> str:
        return self._format_money(self._get_balance(instance).available)


class PayoutInline(admin.TabularInline):
    model = Payout
    fields = [
        "amount",
        "currency",
        "status",
        "period_start",
        "period_end",
        "created_at",
    ]
    readonly_fields = ["created_at"]
    extra = 0
    verbose_name = "Выплата"
    verbose_name_plural = "Выплаты"

    def get_readonly_fields(self, request, obj=None):
        ro = list(super().get_readonly_fields(request, obj))
        if obj and getattr(obj, "status", None) and obj.status != Payout.Status.DRAFT:
            ro.extend(["amount", "currency", "period_start", "period_end"])
        return ro

@register(LegalEntity)
class LegalEntityAdmin(admin.ModelAdmin):
    """
    CHANGE: Django Admin configuration for LegalEntity
    WHY: Required by ТЗ 1.2 - legal entities management interface
    QUOTE(ТЗ): "Сущность «Юридическое лицо» — Новый раздел в админке (список и редактирование)"
    REF: issue #24
    """
    list_display = [
        "short_name_or_name",
        "inn",
        "kpp",
        "status",
        "channels_count",
        "total_balance_amount",
        "total_available_amount",
        "contact_person",
        "contact_phone",
        "created_at",
    ]
    list_filter = [
        ("status", CustomChoiceFilter),
        ("created_at", CustomDateFieldListFilter),
    ]
    search_fields = ["name", "short_name", "inn", "kpp", "contact_person"]
    readonly_fields = [
        "id",
        "created_at",
        "updated_at",
        "total_balance_amount",
        "total_frozen_amount",
        "total_available_amount",
        "export_channels_link",
        "channels_filter_link",
    ]

    fieldsets = (
        (
            "Основная информация",
            {
                "classes": ["wide"],
                "fields": (
                    "name",
                    "short_name",
                    "status",
                    "notes",
                ),
            },
        ),
        (
            "Реквизиты",
            {
                "fields": (
                    "inn",
                    "kpp",
                    "ogrn",
                    "legal_address",
                ),
            },
        ),
        (
            "Банковские реквизиты",
            {
                "fields": (
                    "bank_name",
                    "bank_bik",
                    "bank_correspondent_account",
                    "bank_account",
                ),
            },
        ),
        (
            "Контактная информация",
            {
                "fields": (
                    "contact_person",
                    "contact_phone",
                    "contact_email",
                ),
            },
        ),
        (
            "Системная информация",
            {
                "classes": ["collapse"],
                "fields": (
                    "id",
                    "created_at",
                    "updated_at",
                    "channels_filter_link",
                    "export_channels_link",
                ),
            },
        ),
        (
            "Финансы (агрегировано по каналам)",
            {
                "fields": (
                    "total_balance_amount",
                    "total_frozen_amount",
                    "total_available_amount",
                )
            },
        ),
    )

    inlines = [LegalEntityChannelInline, PayoutInline]

    @admin.display(description="Название", ordering="short_name")
    def short_name_or_name(self, obj):
        return obj.short_name or obj.name

    @admin.display(description="Каналов")
    def channels_count(self, obj: LegalEntity):
        return obj.channels.filter(is_deleted=False).count()

    def _calc_balances(self, obj: LegalEntity) -> ChannelBalance:
        cache_attr = "_totals_cache"
        cached = getattr(obj, cache_attr, None)
        if cached:
            return cached

        channels = list(obj.channels.filter(is_deleted=False))
        balances = BalanceService.get_balance_for_channels(channels)

        total_balance = Decimal("0")
        total_frozen = Decimal("0")
        for channel in channels:
            cb = balances.get(str(channel.id), ChannelBalance(Decimal("0"), Decimal("0"), Decimal("0")))
            total_balance += cb.balance
            total_frozen += cb.frozen
        total_available = max(total_balance - total_frozen, Decimal("0"))

        totals = ChannelBalance(balance=total_balance, frozen=total_frozen, available=total_available)
        setattr(obj, cache_attr, totals)
        return totals

    @staticmethod
    def _format_money(value: Decimal) -> str:
        return f"{value.quantize(Decimal('0.01'))} ₽"

    @admin.display(description="Баланс суммой")
    def total_balance_amount(self, obj: LegalEntity) -> str:
        totals = self._calc_balances(obj)
        return self._format_money(totals.balance)

    @admin.display(description="Заморожено суммой")
    def total_frozen_amount(self, obj: LegalEntity) -> str:
        totals = self._calc_balances(obj)
        return self._format_money(totals.frozen)

    @admin.display(description="Доступно суммой")
    def total_available_amount(self, obj: LegalEntity) -> str:
        totals = self._calc_balances(obj)
        return self._format_money(totals.available)

    @admin.display(description="Фильтр по каналам")
    def channels_filter_link(self, obj: LegalEntity):
        url = reverse("admin:core_channel_changelist")
        url = f"{url}?legal_entity__id__exact={obj.id}"
        return mark_safe(f'<a class="btn btn-info" href="{url}">Список каналов</a>')

    @admin.display(description="Экспорт каналов")
    def export_channels_link(self, obj: LegalEntity):
        url = reverse("admin:core_legalentity_export_channels", args=[obj.id])
        return mark_safe(f'<a class="btn btn-success" href="{url}">Экспорт в CSV</a>')

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "<uuid:object_id>/export-channels/",
                self.admin_site.admin_view(self.export_channels_view),
                name="core_legalentity_export_channels",
            ),
        ]
        return custom_urls + urls

    def export_channels_view(self, request, object_id):
        obj = self.get_object(request, object_id)
        if not obj:
            return HttpResponse(status=404)

        channels = list(obj.channels.filter(is_deleted=False))
        balances = BalanceService.get_balance_for_channels(channels)

        response = HttpResponse(content_type="text/csv")
        filename = f"legal_entity_{obj.id}_channels.csv"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'

        writer = csv.writer(response)
        writer.writerow(["Channel ID", "Name", "TG ID", "Balance", "Frozen", "Available"])
        for channel in channels:
            cb = balances.get(str(channel.id), ChannelBalance(Decimal("0"), Decimal("0"), Decimal("0")))
            writer.writerow([
                channel.id,
                channel.name,
                channel.tg_id,
                cb.balance,
                cb.frozen,
                cb.available,
            ])

        return response


@register(ChannelTransaction)
class ChannelTransactionAdmin(admin.ModelAdmin):
    """
    CHANGE: Refactored for Event Sourcing - removed status and completed_at fields
    WHY: Event Sourcing approach - transactions are append-only, no statuses
    QUOTE(ТЗ): "Event Sourcing - баланс = SUM(transactions). Нет race — только append"
    REF: issue #22 (refactoring)
    """
    list_display = [
        "id",
        "channel",
        "transaction_type",
        "amount",
        "currency",
        "source_type",
        "created_at",
    ]
    list_filter = [
        "transaction_type",
        "currency",
        "source_type",
        ("created_at", CustomDateFieldListFilter),
    ]
    search_fields = [
        "channel__name",
        "description",
        "source_id",
    ]
    readonly_fields = ["id", "created_at", "updated_at"]
    ordering = ["-created_at"]

    def has_delete_permission(self, request, obj=None):
        # Append-only ledger: удаление транзакций запрещено
        return False

    def get_actions(self, request):
        actions = super().get_actions(request)
        actions.pop("delete_selected", None)
        return actions

    fieldsets = (
        (
            "Основная информация",
            {
                "fields": (
                    "channel",
                    "transaction_type",
                    "amount",
                    "currency",
                    "description",
                ),
            },
        ),
        (
            "Источник операции",
            {
                "fields": (
                    "source_type",
                    "source_id",
                ),
            },
        ),
        (
            "Дополнительно",
            {
                "fields": (
                    "metadata",
                ),
            },
        ),
        (
            "Системная информация",
            {
                "classes": ["collapse"],
                "fields": ("id", "created_at", "updated_at"),
            },
        ),
    )


@register(Payout)
class PayoutAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "legal_entity",
        "amount",
        "currency",
        "period_start",
        "period_end",
        "status",
        "created_at",
    ]
    list_filter = ["status", "currency", "created_at"]
    search_fields = ["legal_entity__name", "legal_entity__short_name", "description"]
    readonly_fields = ["id", "created_at", "updated_at"]
    actions = ["mark_as_paid", "mark_as_pending", "mark_as_canceled"]

    fieldsets = (
        (
            "Основное",
            {
                "fields": (
                    "legal_entity",
                    "amount",
                    "currency",
                    "status",
                    "description",
                )
            },
        ),
        (
            "Период",
            {
                "fields": (
                    "period_start",
                    "period_end",
                )
            },
        ),
        (
            "Системные",
            {
                "classes": ["collapse"],
                "fields": (
                    "id",
                    "created_at",
                    "updated_at",
                )
            },
        ),
    )

    def get_readonly_fields(self, request, obj=None):
        ro = list(super().get_readonly_fields(request, obj))
        if obj and obj.status != Payout.Status.DRAFT:
            ro.extend(["legal_entity", "amount", "currency", "period_start", "period_end"])
        return ro

    def save_model(self, request, obj, form, change):
        obj.full_clean()
        super().save_model(request, obj, form, change)

    @admin.action(description="Отметить как Выплачено")
    def mark_as_paid(self, request, queryset):
        for payout in queryset:
            previous = payout.status
            payout.status = Payout.Status.PAID
            payout.save()
            logger.info("Payout %s status %s->paid by %s", payout.id, previous, request.user)

    @admin.action(description="Отметить как В обработке")
    def mark_as_pending(self, request, queryset):
        for payout in queryset:
            previous = payout.status
            payout.status = Payout.Status.PENDING
            payout.save()
            logger.info("Payout %s status %s->pending by %s", payout.id, previous, request.user)

    @admin.action(description="Отменить выплату")
    def mark_as_canceled(self, request, queryset):
        for payout in queryset:
            previous = payout.status
            payout.status = Payout.Status.CANCELED
            payout.save()
            logger.info("Payout %s status %s->canceled by %s", payout.id, previous, request.user)

@register(UserLoginToken)
class UserLoginTokenAdmin(admin.ModelAdmin):
    """
    CHANGE: Добавлена админка для просмотра токенов авторизации
    WHY: Позволить суперадминам отслеживать созданные и использованные токены
    REF: User request
    """
    list_display = ["token_short", "user", "created_by", "expires_at", "used_at", "is_valid_display"]
    readonly_fields = list_display
    search_fields = ["token", "user__username"]
    list_filter = ["used_at", "expires_at"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @admin.display(description="Токен")
    def token_short(self, obj):
        return f"{obj.token[:20]}..." if obj.token else "-"

    @admin.display(description="Валиден", boolean=True)
    def is_valid_display(self, obj):
        return obj.is_valid


@register(ChannelAdmin)
class ChannelAdminAdmin(ModelAdmin):
    list_display = [
        "username_display",
        "first_name",
        "last_name",
        "phone_number",
        "email",
        "cooperation_form",
        "legal_name",
    ]
    readonly_fields = ["is_bot_installed", "user"]
    form = ChannelAdminForm

    def get_queryset(self, request):
        return super().get_queryset(request).filter(role=ChannelAdmin.Role.OWNER)

    @admin.display(description="Ник в Телеграм", ordering="username")
    def username_display(self, instance: ChannelAdmin):
        return mark_safe(
            f"""<span class='tooltip-admin' title='{"Бот установлен" if instance.is_bot_installed else "Бот не-установлен"}'> {instance.username} </span>"""
        )


@admin.register(PublicationRequest)
class PublicationRequestAdmin(admin.ModelAdmin):
    """
    CHANGE: Added admin for PublicationRequest model
    WHY: Required by ТЗ 4.1.2 - allow viewing publication request logs in admin
    REF: issue #46
    """
    list_display = [
        "id",
        "channel",
        "format",
        "status",
        "created_at",
    ]
    list_filter = ["status", "format", "created_at"]
    search_fields = ["channel__name", "channel__username", "error_message"]
    readonly_fields = [
        "id",
        "channel",
        "format",
        "status",
        "campaign_channel",
        "request_data",
        "response_data",
        "error_message",
        "created_at",
        "updated_at",
    ]
    ordering = ["-created_at"]

    def has_add_permission(self, request):
        """Запрещаем создание через админку"""
        return False

    def has_delete_permission(self, request, obj=None):
        """Запрещаем удаление логов"""
        return False
