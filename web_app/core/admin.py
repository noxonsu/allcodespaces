from decimal import Decimal
from typing import Self

from django import forms
from django.contrib import admin
from django.contrib.auth import login, logout
from django.contrib.auth.admin import UserAdmin
from django.core.exceptions import ValidationError
from django.db.models import Sum, QuerySet, Q
from django.forms import Select
from django.http import JsonResponse, FileResponse, HttpResponseRedirect
from django.urls import path
from django.utils.safestring import mark_safe

from web_app.logger import logger
from .admin_forms import (
    CampaignAdminForm,
    ChannelAdminForm,
    ChannelForm,
    MessageModelForm, CampaignChannelInlinedForm,
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
)
from django.contrib.admin import register, ModelAdmin

from .utils import budget_cpm_from_qs,  bulk_notify_channeladmin


class ChannelAdminInlinedForm(forms.ModelForm):
    channeladmin = forms.ModelChoiceField(
        queryset=ChannelAdmin.objects.all(),
        widget=Select(
            attrs={"class": "form-control wide", "data-channel_admin-select": ""}
        ),
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


@register(Channel)
class ChannelModelAdmin(admin.ModelAdmin):
    class Media:
        js = ["core/js/admin_channel_model.js"]

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
    ]
    list_display = [
        "avatar_image",
        "name_str",
        "invitation_link_display",
        "members_count",
        "category",
        "is_bot_installed_html",
        "status_html",
        "avg_posts_reach",
        "cpm",
        "er",
        "err",
        "err_24",
    ]
    inlines = [ChannelAdminInlined]
    ordering = ["-created_at"]
    list_filter = [
        ("name",CustomAllValuesFieldListFilter),
        ("status", CustomChoiceFilter),
        ("is_bot_installed", CustomBooleanFilter),
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
                    "status",
                    "cpm",
                    "btn_link_statistics",
                ),
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
        """To hide the save and continue btn, the history btn is disabled in the template change_form_object_tools.html"""
        extra_context = {} if not extra_context else extra_context
        extra_context["show_save_and_continue"] = False
        return super().changeform_view(request, object_id, extra_context=extra_context)

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
            f'<a class="btn btn-info" href="/core/campaignchannel/?channel__id__exact={instance.id}">Перейти &#128202;</a>'
            if instance
            else "&#10060;"
        )
        return mark_safe(btn_htmlstr)

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

    @admin.display(description="")
    def refresh_statistics(self, obj: Channel):
        client = TGStatClient()
        client.update_channel_info(obj)
        client.update_channel_stat(obj)
        return mark_safe(
            '<a href="" class="btn btn-success">обновить статистику &#128201;</a>'
        )

    def has_view_permission(self, request, obj=None):
        return True

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
        if channel_admin and channel_admin.role == ChannelAdmin.Role.OWNER:
            return qs.filter(admins__id=channel_admin.id)
        return qs

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
        "sov",
    ]
    readonly_fields = fields

    # to delete
    @admin.display(description="Количество каналов")
    def campaign_channels_count(self: Self, instance: CampaignChannel):
        campaign: Campaign = instance.campaign
        return campaign.channels.count()

    @admin.display(description="Ёмкость каналов")
    def campaign_channels_subs_count(self: Self, instance: CampaignChannel):
        # has no effect to do refactor, values are hardcoded in template getting from object campaign
        return Channel.objects.filter(channel_campaigns=instance.id).aggregate(
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


@register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    class Media:
        css = {"all": ["core/css/campaign/change_form.css"]}
        js = ['core/js/campaign/change_form.js']

    actions = None
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
                    "start_date",
                    "finish_date",
                    "white_list",
                    "black_list",
                    "status",
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
            f'<a class="btn btn-info" href="/core/campaignchannel/?campaign__id__exact={str(obj.id)}">Ссылка на страницу Статистика по РК </a>'
        )

    def changeform_view(self, request, object_id=None, form_url="", extra_context=None):
        """To hide the save and continue btn, the history btn is disabled in the template change_form_object_tools.html"""
        extra_context = {} if not extra_context else extra_context
        extra_context["show_save_and_continue"] = False
        extra_context["show_save_and_add_another"] = False
        return super().changeform_view(request, object_id, extra_context=extra_context)


@register(Message)
class MessageAdmin(admin.ModelAdmin):
    class Media:
        js = ["core/js/message/change_form.js"]
        css = {"all": ["core/css/message/change_form.css"]}

    readonly_fields = ["id", "display_image", "display_image_thumbil"]
    list_display = ["__str__",'title_display' ,"message_type", "display_image_thumbil"]
    form = MessageModelForm

    fields = [
        "name",
        "title",
        "body",
        "image",
        "video",
        "button_str",
        "button_link",
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

    def _remove_changelist_delete_obj(self, actions_dict):
        del actions_dict["delete_selected"]

    def get_actions(self, request):
        response = super().get_actions(request)
        self._remove_changelist_delete_obj(response)
        return response


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
    actions = [
        'login_as'
    ]
    list_display = (
        'username', 'email', 'first_name', 'last_name', 'is_superuser', 'is_staff'
    )

    def login_as(self, request, instance):
        logout(request)
        login(request, instance.first())
        return HttpResponseRedirect(redirect_to='/')


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
