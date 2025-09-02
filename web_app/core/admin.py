from decimal import Decimal
from typing import Self

from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.core.exceptions import ValidationError
from django.db.models import Sum
from django.forms import Select
from django.http import JsonResponse, FileResponse
from django.urls import path
from django.utils.safestring import mark_safe

from web_app.logger import logger
from .admin_forms import CampaignAdminForm, ChannelAdminForm, ChannelForm
from .admin_utils import MultipleSelectListFilter, CustomDateFieldListFilter, can_change_channel_status
from .exporter import QuerySetExporter
from .external_clients import TGStatClient
from .models import Channel, Campaign, Message, CampaignChannel, User, MessageLink, ChannelAdmin
from django.contrib.admin import register, ModelAdmin

from .utils import budget_cpm_from_qs


class ChannelAdminInlinedForm(forms.ModelForm):
    channeladmin = forms.ModelChoiceField(
        queryset=ChannelAdmin.objects.all(),
        widget=Select(attrs={'class': 'form-control wide', 'data-channel_admin-select':""}),
    )
    class Meta:
        model = Channel.admins.through
        fields = '__all__'
    class Media:
        js = {
            'custom/channel_admin_inlined.js'
        }


class ChannelAdminInlined(admin.TabularInline):
    form = ChannelAdminInlinedForm
    model = Channel.admins.through
    extra = 1
    max_num = 10
    verbose_name_plural = 'Администраторы канала'
    verbose_name = 'Администратор канала'
    template = 'admin/core/channel/channel_admin_tab_inlined.html'

    def get_queryset(self, request):
        resolver_match = request.resolver_match
        if resolver_match and getattr(resolver_match, 'kwargs'):
            object_id = resolver_match.kwargs.get('object_id')
            return Channel.admins.through.objects.filter(channel__id=object_id)
        return super().get_queryset(request)


    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return True

    def has_add_permission(self, request, obj):
        return True



@register(Channel)
class ChannelModelAdmin(admin.ModelAdmin):
    readonly_fields = [
        'country',
        'category',
        'name',
        'members_count',
        'avg_posts_reach',
        'username',
        'er',
        'err',
        'err_24',
        'posts_count',
        'daily_reach',
        'about',
        'language',
        'id',
        'tg_id',
        'is_bot_installed',
        'avatar_image',
        'invitation_link',
        'refresh_statistics',
    ]
    list_display = [
        'name_str',
        'invitation_link',
        'country',
        'language',
        'members_count',
        'status',
        'is_bot_installed',
        'avg_posts_reach',
        'er',
        'err',
        'err_24',
        'category',
    ]
    inlines = [ChannelAdminInlined]
    ordering = ['-created_at']
    list_filter = [
        ('name', MultipleSelectListFilter),
        ('country', MultipleSelectListFilter),
        ('language', MultipleSelectListFilter),
        'status',
        'is_bot_installed',
    ]
    empty_value_display = "-"
    fieldsets = (
        ("Общие", {
            "classes": ['wide'],
            'fields': (
                'id',
                'name',
                'status',
                'is_bot_installed',
                'cpm',
                'avatar_image'
            ),
        }),
        ('информация',{
            'fields': (
                    'tg_id',
                    'country',
                    'category',
                    'members_count',
                    'avg_posts_reach',
                    'username',
                    'er',
                    'err',
                    'err_24',
                    'posts_count',
                    'daily_reach',
                    'about',
                    'language',
                    'invitation_link',
                    'refresh_statistics',
                )
            }),
    )
    form = ChannelForm

    def formfield_for_dbfield(self, db_field, **kwargs):
        """Modify formfields for change/add """
        form_field = super().formfield_for_dbfield(db_field, **kwargs)
        try:
            if db_field.name == 'status':
                form_field.disabled = True
                request = kwargs.get('request')
                if request and can_change_channel_status(request.user):
                    form_field.disabled = False
                return form_field
        except Exception:
            form_field.disabled = False
            pass
        finally:
            return form_field



    @admin.display(description='Название', ordering='name')
    def name_str(self, instance: Channel) -> str:
        tooltip_attrs = ""
        if not instance.admins.exists():
            tooltip_attrs = """class='tooltip-channel' title='нет админов в этом канале' """
        htm_str = "<span {}>{instance.name}</span>".format(tooltip_attrs, instance=instance)
        return mark_safe(htm_str)

    @admin.display(description='')
    def refresh_statistics(self, obj: Channel):
        client = TGStatClient()
        client.update_channel_info(obj)
        client.update_channel_stat(obj)
        return mark_safe('<a href="" class="btn btn-success">обновить статистику</a>')

    def has_view_permission(self, request, obj=None):
        return True

    def _remove_changelist_delete_obj(self, actions_dict):
        if 'delete_selected' in actions_dict:
            del actions_dict['delete_selected']

    def get_actions(self, request):
        response = super().get_actions(request)
        self._remove_changelist_delete_obj(response)
        return response

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        user = request.user
        channel_admin = getattr(user, 'profile', None)
        if channel_admin and channel_admin.role == ChannelAdmin.Role.OWNER:
            return qs.filter(admins__id=channel_admin.id)
        return qs

    def has_add_permission(self, request):
        return False

    @admin.display()
    def avatar_image(self, obj):
        if obj.avatar_url:
            return mark_safe(f"<img class='img-circle'  src={obj.avatar_url} alt='image-{obj.name}' style='width:70%;height:70%;'>")
        return '-'

    def get_urls(self):
        urls = super().get_urls()
        urls.append(
            path('<uuid:object_id>/channel-admins-list',
                         self.admin_site.admin_view(self.filter_channel_admin_inlined)))
        return urls

    def filter_channel_admin_inlined(self, request, object_id ):
        admins = map(lambda x: {"id": str(x.id), "text": str(x), "disabled": True},
                     ChannelAdmin.objects.filter(channels__id=object_id))
        data = list(admins)
        if data:
            data[0].update({'selected': 'selected'})
        return JsonResponse(data=data, safe=False)


class CampaignChannelInlinedForm(forms.ModelForm):
    channel = forms.ModelChoiceField(
        queryset=Channel.objects.all(),
        widget=Select(
            attrs={'class': "form-group", 'data-channel-select':""},
        )

    )
    channel_admin = forms.ModelChoiceField(
        queryset=ChannelAdmin.objects.all(),
        widget=Select(attrs={'class': "form-group", 'data-channel_admin-select':""},),
        required=True
    )

    def clean(self: Self):
        from core.utils import budget_cpm
        instance: CampaignChannel = self.instance
        campaign: Campaign = self.cleaned_data.get('campaign')
        cpm: Decimal = self.cleaned_data.get('cpm', 0)
        impressions_plan: Decimal = self.cleaned_data.get('impressions_plan', 0)
        budget: Decimal = campaign.budget
        if not budget:
            raise ValidationError("бюджет обязательное поле")
        current_total_budget = budget_cpm(cpm=cpm, impressions_plan=impressions_plan)
        if not campaign or (campaign and not campaign.id):
            if current_total_budget > budget:
                raise ValidationError({'cpm':"Суммарный бюджет каналов больше чем указанный бюджет кампании"})
        elif instance and campaign.budget:
            total_budget = budget_cpm_from_qs(CampaignChannel.objects.filter(campaign=campaign, channel__isnull=False))
            total_budget+= current_total_budget
            if total_budget > campaign.budget:
                raise ValidationError({"cpm": "Суммарный бюджет каналов больше чем указанный бюджет кампании"})

        return super().clean()


    # def clean_deleted(self: Self):
    #     to_delete = self.cleaned_data.get('DELETE', False)
    #     to_delete_instance = self.cleaned_data.get('id' )
    #     if to_delete and self.instance and self.instance.is_message_published:
    #         raise ValidationError('Cannot delete published post!')

    class Meta:
        model = CampaignChannel
        fields = '__all__'



class CampaignChannelInlined(admin.TabularInline):
    model = CampaignChannel
    verbose_name = 'Канал'
    verbose_name_plural = 'Каналы'
    extra = 1
    readonly_fields = [
        'impressions_fact',
        'message_publish_date',
        'channel_post_id',
        'publish_status',
        'clicks',
        'update_statistics',
    ]
    form = CampaignChannelInlinedForm
    template = 'admin/core/campaign/campaign_channel_tabular.html'
    class Media:
        js = {
            'custom/campaign_channel_inlined.js'
        }

    @admin.display(description='Обновить статистику')
    def update_statistics(self, instance):
        if not instance._state.adding:
            from core.tasks import update_campaign_channel_views
            update_campaign_channel_views.delay(campaign_channel_id=instance.id)
            logger.info("[Task](update_campaign_channel_views) started from admin")
            return mark_safe(f'<a href="" class="btn btn-success">Обновить статистику </a>')
        else:
            return '-'

    def has_change_permission(self, request, obj=None):
        return False



class ReadOnlyCampaignChannelInlined(admin.TabularInline):
    def has_add_permission(self, request, obj):
        return False
    def has_change_permission(self, request, obj=None):
        return False
    def has_delete_permission(self, request, obj=None):
        return False

    template = 'admin/core/campaign/campaign_channels.html'

    extra = 0
    model = CampaignChannel
    verbose_name_plural = 'Прогноз'
    verbose_name = 'Прогноз'
    fields = ['campaign_channels_count', 'campaign_channels_subs_count', 'channels_avg_posts_reach', 'sov']
    readonly_fields = fields

    # to delete
    @admin.display(description='Количество каналов')
    def campaign_channels_count(self: Self, instance: CampaignChannel):
        campaign: Campaign = instance.campaign
        return campaign.channels.count()


    @admin.display(description='Ёмкость каналов')
    def campaign_channels_subs_count(self: Self, instance: CampaignChannel):
        # has no effect to do refactor, values are hardcoded in template getting from object campaign
        return Channel.objects.filter(channel_campaigns=instance.id).aggregate(Sum('members_count'))['members_count__sum']

    @admin.display(description='Ёмкость рекл.поста')
    def channels_avg_posts_reach(self: Self, instance: CampaignChannel):# has no effect
        # has no effect to do refactor, values are hardcoded in template getting from object campaign
        return instance.campaign.campaigns_channel.aggreget(Sum('avg_posts_reach'))['avg_posts_reach__sum']

    @admin.display(description='SOV')
    def sov(self, instance: CampaignChannel):
        # has no effect to do refactor, values are hardcoded in template getting from object campaign
        campaign = instance.campaign
        subs_count = instance.campaign_channels_subs_count()
        total_impressions_plan = campaign.campaign_channels.aggregate(sum=Sum('impressions_fact'))['sum']
        return f"{total_impressions_plan / subs_count:.0%}"


@register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    list_max_show_all = 50
    list_per_page = 20
    form = CampaignAdminForm

    readonly_fields = [
        'id',
        'total_planed_views',
        'avg_cpm',
        'link_to_statistics',
    ]

    list_display = ['name_str', 'client', 'start_date', 'finish_date', 'status', 'budget']
    inlines = [CampaignChannelInlined, ReadOnlyCampaignChannelInlined]
    list_filter = [
        ('name', MultipleSelectListFilter),
        ('client', MultipleSelectListFilter),
        'status',
    ]

    @admin.display(description='Название', ordering='name')
    def name_str(self, obj: Campaign) -> str:
        campaignchannels_count = obj.campaigns_channel.filter(publish_status=CampaignChannel.PublishStatusChoices.PUBLISHED, channel_post_id__isnull=False).count()
        htm_str = f'<span>{obj.name}</span>'
        if campaignchannels_count:
            htm_str = f'<span class="tooltip-campaign" title="кол-во опубликованных постов ({campaignchannels_count})">{obj.name}</span>'
        return mark_safe(htm_str)

    @admin.display(description='Статистики')
    def link_to_statistics(self, obj: Campaign)->str:
        if not obj.pk:
            return '-'
        return mark_safe(
            f'<a class="btn btn-info" href="/core/campaignchannel/?campaign__id__exact={str(obj.id)}">Ссылка на страницу Статистика по РК </a>'
        )

    fieldsets = (
        ("Общие(основная вкладка)", {
            "classes": ['wide'],
            'fields': (
                'id',
                'name',
                'status',
                'budget',
                'start_date',
                'finish_date',
                'inn_advertiser',
                'client',
                'brand',
                'token_ord',
                'avg_cpm',
                'total_planed_views',
                'link_to_statistics'
            )
        }),
        (
            'Фильтры',
            {
                "fields": ['white_list', 'black_list']
            }
        ),
        (
            'Сообщение', {
                "classes": ['wide'],
                'fields': ('message', )
            }
        ),
    )


class MessageModelForm(forms.ModelForm):
    button_link = forms.URLField(required=True)

    class Meta:
        model = Message
        fields = '__all__'

@register(Message)
class MessageAdmin(admin.ModelAdmin):
    readonly_fields = ['id', 'display_image', 'display_image_thumbil']
    list_display = ['__str__', 'message_type','display_image_thumbil' ]
    form = MessageModelForm

    fields = [
        'name',
        'title',
        'body',
        'image',
        'video',
        'button_str',
        'button_link',
        'is_external',
        'display_image_thumbil',
        'id',
    ]

    @admin.display(description='Body')
    def message_body(self, obj):
        return obj.body[:15]+'...'

    @admin.display(description='Displayed Image')
    def display_image(self, obj):
        if obj.image:
            return mark_safe(f"<img src={obj.image.url} alt='image-{obj.title}' style='width:70%;height:70%;'>")
        return '-'

    def display_image_thumbil(self, obj):
        if obj.image:
            text = f'''
            <div class="thumb-container" >
                <a href="{obj.image.url}" data-jbox-image="thumb-image" title="{str(obj.image)}" >
                    <img class="thumb-image" src="{obj.image.url}" alt="Thumbnail Image"> 
                <a>
            </div>'''
            return mark_safe(text)
        return '-'

    def _remove_changelist_delete_obj(self, actions_dict):
        del actions_dict['delete_selected']

    def get_actions(self, request):
        response = super().get_actions(request)
        self._remove_changelist_delete_obj(response)
        return response


@register(CampaignChannel)
class CampaignChannelAdmin(admin.ModelAdmin):
    list_display = [
        'campaign_link',
        'channel_link',
        'message_publish_date',
        'impressions_plan_col',
        'impressions_fact',
        'precentage_col',
        'clicks',
        'ctr_col',
        'earned_money',
    ]

    list_filter = [
        'campaign',
        'channel',
        ('message_publish_date', CustomDateFieldListFilter),
        'publish_status',
    ]
    readonly_fields = ['ctr_col','precentage_col','impressions_plan_col', 'impressions_fact', 'message_publish_date', 'channel_post_id', 'clicks',  'publish_status', 'impressions_fact_owner']

    def has_add_permission(self, request):
        return False
    
    @admin.display(description='Показы-план', ordering='impressions_plan')
    def impressions_plan_col(self, obj):
        return obj.impressions_plan if obj.impressions_plan else '-'

    @admin.display(description='CTR', ordering='impressions_fact')
    def ctr_col(self, obj: CampaignChannel):
        return f"{(obj.clicks / obj.impressions_fact)*100:.2f}%" if obj.clicks and obj.impressions_fact else '-'

    @admin.display(description='% от плана', ordering='impressions_plan')
    def precentage_col(self, obj):
        return f'{(obj.impressions_fact / obj.impressions_plan) * 100:.2f}%' if obj.impressions_plan and obj.impressions_fact else '-'


    @admin.display(description='Канал', ordering='channel')
    def channel_link(self, obj):
        return mark_safe(f'<a href="/core/channel/{obj.channel.id}/change/"> {obj.channel}</a>')

    def _remove_changelist_delete_obj(self, actions_dict):
        if 'delete_selected' in actions_dict:
            del actions_dict['delete_selected']

    def get_actions(self, request):
        response = super().get_actions(request)
        self._remove_changelist_delete_obj(response)
        return response


    @admin.display(description='Название РК', ordering='campaign')
    def campaign_link(self, obj: CampaignChannel):
        return mark_safe(f'<a href="/core/campaign/{obj.campaign.id}/change/"> {obj.campaign}</a>')


    def export_to_xlsx(self, request):
        self.message_user(request, 'Выгрузка в excel запущено')
        cols = ['campaign', 'channel', 'message_publish_date', 'impressions_fact', 'clicks', 'earned_money', 'publish_status']
        queryset = self.get_queryset(request)
        data_buffer = QuerySetExporter(data=queryset, format='xlsx', cols=cols, for_user=request.user).process()
        return FileResponse(data_buffer,  filename='export.xlsx', as_attachment=True, content_type='application/vnd.ms-excel', charset='utf-8')

    def get_urls(self):
        urls = super().get_urls()
        urls.append(path('export-xlsx', self.admin_site.admin_view(self.export_to_xlsx)))
        return urls

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        user = request.user
        channel_admin = ChannelAdmin.objects.filter(user=user).first()
        if user.is_superuser:
            return qs
        elif not channel_admin:
            return qs.none()
        elif channel_admin and user.groups.filter(name__in=['owner', 'owners']):
            return qs.filter(channel__in=channel_admin.channels.values_list('id', flat=True))
        return qs

    def get_list_display(self, request):
        response = super().get_list_display(request).copy()
        user = request.user
        if user.groups.filter(name__in=['owner', 'owners']):
            response.remove('campaign_link') # remove first col
            response.remove('impressions_plan_col')
            response.remove('precentage_col')
            i_ =response.index('impressions_fact')
            response[i_]= 'impressions_fact_owner'
            return response
        return response

    def get_list_filter(self, request):
        response = super().get_list_filter(request).copy()
        user = request.user
        if user.groups.filter(name__in=['owners', 'owner']):
            response.remove('campaign') # remove first col
            return response
        return response

    @admin.display(description='Показы', ordering='impressions_fact')
    def impressions_fact_owner(self, obj):
            return obj.impressions_fact if obj.impressions_fact else '-'


@register(User)
class UserAdmin(UserAdmin): ...


@register(ChannelAdmin)
class ChannelAdminAdmin(ModelAdmin):
    list_display = ['username_display', 'first_name', 'last_name', 'phone_number', 'email', 'cooperation_form', 'legal_name']
    readonly_fields = ['is_bot_installed']
    form = ChannelAdminForm

    def get_queryset(self, request):
        return super().get_queryset(request).filter(role=ChannelAdmin.Role.OWNER)

    @admin.display(description='Ник в Телеграм', ordering='username')
    def username_display(self, instance: ChannelAdmin):
        return mark_safe(f"""<span class='tooltip-admin' title='{'Бот установлен' if instance.is_bot_installed else 'Бот не-установлен'}'> {instance.username} </span>""")

