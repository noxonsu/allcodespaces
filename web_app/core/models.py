from __future__ import annotations

from functools import cached_property

from django.utils.safestring import mark_safe
from django_prometheus.models import ExportModelOperationsMixin

from .utils import RolePermissions
from decimal import Decimal
from datetime import datetime, timedelta
try:
    from typing import Self  # type: ignore
except ImportError:
    from typing_extensions import Self

from django.contrib import admin
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.contrib.postgres.fields import ArrayField
from django.db.models import JSONField, Sum, Avg, F, Q
from django.utils.translation import gettext_lazy as _
from rest_framework.request import Request

from core.base_models import BaseModel
from core.db_proxies import CampaignQS, CampaignChannelQs
from core.models_qs import ChannelAdminManager
from core.models_validators import campaign_budget_validator
from django.core.exceptions import ValidationError
from django.utils import timezone


class PlacementFormat(models.TextChoices):
    SPONSORSHIP = "sponsorship", "Спонсорство"
    FIXED_SLOT = "fixed_slot", "Фикс-слот"
    AUTOPILOT = "autopilot", "Автопилот"


def default_supported_formats() -> list[str]:
    return list(PlacementFormat.values)


SPONSORSHIP_BODY_LENGTH_LIMIT = 160
SPONSORSHIP_BUTTON_LIMIT = 1


class User(ExportModelOperationsMixin("user"), AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "administrator", "Super Administrator"
        PUBLISHER = "admin", "Administrator"

    role = models.CharField(choices=Role.choices, max_length=50, null=True, blank=True)

    @cached_property
    def has_profile(self):
        return getattr(self, 'profile',  None)

    @cached_property
    def is_owner(self):
        return self.has_profile and self.profile.is_owner

    @cached_property
    def is_manager(self):
        return self.has_profile and self.profile.is_manager

    class Meta:
        verbose_name_plural = "Пользователи"
        verbose_name = "Пользователь"
        ordering = ["-date_joined"]


class UserLoginToken(BaseModel):
    """Временный токен для входа под пользователем"""
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="login_tokens",
        verbose_name="Пользователь"
    )
    token = models.CharField(max_length=255, unique=True, verbose_name="Токен")
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_login_tokens",
        verbose_name="Создан администратором"
    )
    expires_at = models.DateTimeField(verbose_name="Истекает")
    used_at = models.DateTimeField(null=True, blank=True, verbose_name="Использован")

    class Meta:
        verbose_name = "Токен входа"
        verbose_name_plural = "Токены входа"
        ordering = ["-created_at"]

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def is_used(self) -> bool:
        return self.used_at is not None

    @property
    def is_valid(self) -> bool:
        return not self.is_expired and not self.is_used


class ChannelAdmin(ExportModelOperationsMixin("channeladmin"), BaseModel):
    class CooperationFormChoices(models.TextChoices):
        LEGAL = "legal", "ФЛ (без статуса СЗ)"
        C3 = "c3", "СЗ"
        ENTREPRENEUR = "entrepreneur", "ИП"
        OOO = "ooo", "ООО"

    class Role(models.TextChoices):
        OWNER = "owner", "Владелец канала"
        MANAGER = "manager", "Менеджер Системы"

    username = models.CharField(
        max_length=250, default="", verbose_name="Ник в Телеграм"
    )
    tg_id = models.CharField(default=0, verbose_name="ID в Телеграм")
    first_name = models.CharField(
        max_length=250, default="", verbose_name="Имя", blank=True
    )
    last_name = models.CharField(
        max_length=250, default="", verbose_name="Фамилия", blank=True
    )
    phone_number = models.CharField(
        max_length=250, default="", verbose_name="Моб.телефон", blank=True
    )
    email = models.EmailField(
        max_length=250, default="", verbose_name="Е-маил", blank=True
    )
    inn = models.PositiveIntegerField(default=0, verbose_name="ИНН", blank=True)
    legal_name = models.CharField(
        max_length=250, default="", verbose_name="Название юр.лица", blank=True
    )
    cooperation_form = models.CharField(
        max_length=50,
        choices=CooperationFormChoices.choices,
        default=CooperationFormChoices.LEGAL,
        verbose_name="Форма сотрудничества",
        blank=True,
    )
    role = models.CharField(max_length=50, choices=Role.choices, default=Role.OWNER)
    channels = models.ManyToManyField(
        "Channel", verbose_name="Каналы", related_name="admins", blank=True
    )
    is_bot_installed = models.BooleanField(default=False, verbose_name="Бот")
    user = models.OneToOneField(
        "User",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        verbose_name="Профиль",
        related_name="profile",
    )

    objects = ChannelAdminManager()

    class Meta:
        verbose_name_plural = "Администраторы каналов"
        verbose_name = "Администратор каналов"
        ordering = ["-created_at"]

    def get_role_permissions(self):
        _default_permissions = RolePermissions(
            content_types=(
                "CampaignChannel",
                "Channel",
                "ChannelPublicationSlot",
            ),
            permissions=("view_campaignchannel", "view_channel"),
        )

        role_permissions = {
            "manager": RolePermissions(
                content_types=(
                    "Message",
                    "Channel",
                    "Campaign",
                    "ChannelAdmin",
                    "CampaignChannel",
                ),
                permissions="__all__",
            ),
            "owner": _default_permissions,
        }
        return role_permissions.get(self.role, _default_permissions)

    @cached_property
    def is_owner(self):
        return self.role == self.Role.OWNER

    @cached_property
    def is_manager(self):
        return self.role == self.Role.MANAGER


    @property
    def chat(self):
        return f"https://t.me/{self.username}" if self.username else ""

    @property
    def as_str(self):
        return f"{self.first_name} {self.last_name} ({self.username})"

    def __str__(self):
        return self.as_str


# to delete
class MessageLink(BaseModel):
    title = models.TextField(verbose_name=_("название ссылки"))
    url = models.URLField(verbose_name=_("URL-адрес"))

    def as_html(self):
        return f"<a href='{self.url}'>{self.title} </a>"

    def __str__(self):
        return self.title

    class Meta:
        verbose_name_plural = "ссылки"
        verbose_name = "ссылка"
        ordering = ["-created_at"]


class Message(ExportModelOperationsMixin("message"), BaseModel):
    """TG campaigns Message"""

    def image_path(instance, filename):
        from pathlib import Path

        return Path("messages") / Path(str(instance.id)) / filename

    image = models.ImageField(
        verbose_name=_("изображение"), null=True, blank=True, upload_to=image_path
    )
    video = models.FileField(
        verbose_name=_("видео"), null=True, blank=True, upload_to=image_path
    )
    title = models.CharField(
        max_length=250, null=True, blank=True, verbose_name=_("заголовок")
    )
    body = models.TextField(verbose_name=_("тело"))
    name = models.CharField(
        max_length=250, verbose_name=_("название"), null=True, blank=True
    )
    # button = models.ForeignKey('MessageLink', verbose_name='кнопка',on_delete=models.CASCADE, related_name='messages', null=True, blank=True)
    button_str = models.CharField(
        max_length=250,
        default="Click Me!",
        blank=True,
        verbose_name=_("Текст на кнопке"),
    )
    button_link = models.URLField(
        null=True, blank=True, verbose_name=_("Посадочная страница")
    )
    is_external = models.BooleanField(
        default=False, verbose_name="Ссылка на канал телеграм?"
    )
    format = models.CharField(
        max_length=32,
        choices=PlacementFormat.choices,
        default=PlacementFormat.FIXED_SLOT,
        verbose_name="Формат размещения",
    )
    ad_individual = models.CharField(
        max_length=250, default="", blank=True, verbose_name="Юр. лицо рекламодателя"
    )
    ad_inn = models.CharField(
        max_length=250, default="", blank=True, verbose_name="ИНН рекламодателя"
    )
    erid = models.CharField(max_length=250, default="", blank=True, verbose_name="ERID")

    def __str__(self):
        str_ = self.name if self.name else self.title if self.title else self.body
        len_str: int = len(str_)
        return str_[:130] + "...." if len_str > 130 else str_

    class Meta:
        verbose_name_plural = "Креативы"
        verbose_name = "Креатив"
        ordering = ["-created_at"]

    @property
    def as_text(self) -> str:
        title = self.title if self.title else self.name
        return f"<b>{title}</b>\n{self.body}\n\n<i>{self.footer}</i>"

    @property
    def footer(self):
        _footer = ''
        if self.ad_inn and self.ad_individual and self.erid:
            _footer = (
                f'Телевин Реклама: {self.ad_individual},'+
                f' ИНН: {self.ad_inn},'
                +f' erid: {self.erid}'
            )
        return _footer

    @property
    @admin.display(description="Тип")
    def message_type(self) -> str:
        return (
            "Image+Video"
            if self.image and self.video
            else "Video"
            if self.video
            else "Image"
            if self.image
            else "-"
        )

    @property
    def button_count(self) -> int:
        return 1 if self.button_link and self.button_str else 0

    def clean(self):
        super().clean()
        if self.format == PlacementFormat.SPONSORSHIP:
            body = self.body or ""
            if len(body) > SPONSORSHIP_BODY_LENGTH_LIMIT:
                raise ValidationError(
                    {
                        "body": f"Для формата «Спонсорство» допустимо до {SPONSORSHIP_BODY_LENGTH_LIMIT} символов."
                    }
                )
            if self.button_count > SPONSORSHIP_BUTTON_LIMIT:
                raise ValidationError(
                    {
                        "button_link": "Для формата «Спонсорство» допустима только одна кнопка."
                    }
                )


class MessagePreviewToken(BaseModel):
    token = models.CharField(max_length=255, unique=True, verbose_name="Токен предпросмотра")
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name="preview_tokens",
        verbose_name="Креатив",
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="message_preview_tokens",
        verbose_name="Создан",
    )
    expires_at = models.DateTimeField(verbose_name="Истекает")
    used_at = models.DateTimeField(null=True, blank=True, verbose_name="Использован")

    class Meta:
        verbose_name = "Токен предпросмотра"
        verbose_name_plural = "Токены предпросмотра"
        ordering = ["-created_at"]

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def is_used(self) -> bool:
        return self.used_at is not None


class Channel(ExportModelOperationsMixin("channel"), BaseModel):
    """Channel should be in TG, Channel has many campaigns"""

    class ChannelStatus(models.TextChoices):
        PENDING = "pending", "На модерации"
        CONFIRMED = "confirmed", "Подтверждено"
        REJECTED = "rejected", "Отказано"

        def to_html(self):
            if self.value == 'confirmed':
                html_str= '<img src="/static/admin/img/icon-yes.svg" alt="True">'
            elif self.value == 'rejected':
                html_str='<img src="/static/admin/img/icon-no.svg" alt="False">'
            else:
                html_str= '<i class="fa-solid fa-hourglass"></i>'

            return mark_safe(html_str)

    name = models.CharField(max_length=250, verbose_name=_("Название"))
    country = models.CharField(
        max_length=250, verbose_name=_("Страна"), null=True, blank=True
    )
    category = models.CharField(
        max_length=250, verbose_name=_("Тематика"), null=True, blank=True
    )
    username = models.CharField(
        max_length=250, verbose_name=_("username"), null=True, blank=True
    )
    invitation_link = models.URLField(
        max_length=250, verbose_name=_("ссылка-приглашение"), null=True, blank=True
    )
    members_count = models.PositiveIntegerField(
        verbose_name=_("Подписчики"), default=0, null=True
    )
    tg_id = models.TextField(verbose_name=_("tg id"), blank=True, null=True)
    is_bot_installed = models.BooleanField(
        verbose_name=_("Бот ТЕЛЕВИН"), default=False, help_text="Бот установлен"
    )
    # to do delete
    # is_active = models.BooleanField(default=False, verbose_name=_('Подтвержден'))
    status = models.CharField(
        verbose_name="Статус модерации",
        choices=ChannelStatus.choices,
        default=ChannelStatus.PENDING,
        max_length=10,
    )
    meta = JSONField(null=True, blank=True, verbose_name=_("meta"))
    avatar_url = models.URLField(null=True, blank=True, verbose_name=_("avatar"),  default='/static/custom/default.jpg')
    avg_posts_reach = models.FloatField(
        blank=True, verbose_name=_("Охват"), default=0, null=True
    )
    er = models.FloatField(blank=True, verbose_name=_("ER"), default=0, null=True)
    err = models.FloatField(blank=True, verbose_name=_("ERR"), default=0, null=True)
    err_24 = models.FloatField(
        blank=True, verbose_name=_("ERR24"), default=0, null=True
    )
    posts_count = models.PositiveIntegerField(
        blank=True, verbose_name=_("количество сообщений"), default=0, null=True
    )
    daily_reach = models.FloatField(
        blank=True, verbose_name=_("ежедневный охват"), default=0, null=True
    )
    about = models.TextField(
        blank=True, verbose_name=_("описание"), default="", null=True
    )
    language = models.CharField(
        blank=True, verbose_name=_("Язык"), default="", null=True
    )
    is_deleted = models.BooleanField(
        default=False,
        verbose_name="Мягко удалён",
        help_text="Канал скрыт из списков и расчётов выплат",
    )
    cpm = models.PositiveIntegerField("CPM", default=0)
    supported_formats = ArrayField(
        base_field=models.CharField(
            max_length=32,
            choices=PlacementFormat.choices,
        ),
        blank=True,
        default=default_supported_formats,
        verbose_name="Поддерживаемые форматы",
    )
    require_manual_approval = models.BooleanField(
        default=False,
        verbose_name="Требует ручного подтверждения",
        help_text="Если включено, владелец канала должен вручную подтверждать каждую публикацию"
    )

    def __str__(self):
        return self.name

    @property
    def is_active(self) -> bool:
        return self.status == self.ChannelStatus.CONFIRMED and not self.is_deleted

    @is_active.setter
    def is_active(self, val: bool):
        if val:
            self.status = Channel.ChannelStatus.CONFIRMED
        elif val is False:
            self.status = Channel.ChannelStatus.REJECTED
        elif val is None:
            self.status = Channel.ChannelStatus.PENDING

    def supports_format(self, format_code: str) -> bool:
        if not format_code:
            return True
        formats = self.supported_formats or []
        if not formats:
            return True
        return format_code in formats

    class Meta:
        verbose_name_plural = "Каналы"
        verbose_name = "Канал"
        ordering = ["-created_at"]


class ChannelPublicationSlot(BaseModel):
    class Weekday(models.IntegerChoices):
        MONDAY = 0, "Понедельник"
        TUESDAY = 1, "Вторник"
        WEDNESDAY = 2, "Среда"
        THURSDAY = 3, "Четверг"
        FRIDAY = 4, "Пятница"
        SATURDAY = 5, "Суббота"
        SUNDAY = 6, "Воскресенье"

    channel = models.ForeignKey(
        Channel,
        on_delete=models.CASCADE,
        related_name="publication_slots",
        verbose_name="Канал",
    )
    weekday = models.IntegerField(
        choices=Weekday.choices, verbose_name="День недели"
    )
    start_time = models.TimeField(verbose_name="Начало")
    end_time = models.TimeField(verbose_name="Окончание")

    class Meta:
        verbose_name = "Доступный слот публикации"
        verbose_name_plural = "Доступные слоты публикации"
        ordering = ["channel", "weekday", "start_time"]
        unique_together = ("channel", "weekday", "start_time", "end_time")

    def clean(self):
        super().clean()
        if self.start_time >= self.end_time:
            raise ValidationError(
                {"end_time": "Время окончания должно быть позже времени начала"}
            )

    def __str__(self):
        return f"{self.get_weekday_display()} {self.start_time}-{self.end_time}"

    @property
    def label(self) -> str:
        return f"{self.get_weekday_display()} {self.start_time.strftime('%H:%M')} - {self.end_time.strftime('%H:%M')}"


class Campaign(ExportModelOperationsMixin("campaign"), BaseModel):
    """Campaign of channel/s"""

    class Statuses(models.TextChoices):
        ACTIVE = "active", "Активна"
        PAUSED = "paused", "На паузе"

    name = models.CharField(max_length=250, verbose_name=_("Название"))
    format = models.CharField(
        max_length=32,
        choices=PlacementFormat.choices,
        default=PlacementFormat.FIXED_SLOT,
        verbose_name="Формат размещения",
    )
    status = models.CharField(
        choices=Statuses.choices,
        max_length=6,
        verbose_name=_("Статус"),
        default=Statuses.PAUSED,
    )
    budget = models.DecimalField(
        verbose_name=_("Бюджет (руб.)"),
        max_digits=8,
        decimal_places=2,
        validators=[campaign_budget_validator],
    )
    start_date = models.DateField(verbose_name=_("Дата старта"))
    finish_date = models.DateField(verbose_name=_("Дата завершения"))
    slot_publication_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Дата и время публикации",
        help_text="Обязательно для формата «Фикс-слот»",
    )
    channels = models.ManyToManyField("Channel", through="CampaignChannel", blank=True)
    message = models.ForeignKey(
        to="Message",
        on_delete=models.CASCADE,
        related_name="campaigns",
        verbose_name=_("message"),
    )
    white_list = ArrayField(
        base_field=models.CharField(max_length=250),
        blank=True,
        default=list,
        verbose_name="разрешённые слова",
        help_text="разделитель , (если пусто то не будет фильтровать)",
    )
    black_list = ArrayField(
        base_field=models.CharField(max_length=250),
        blank=True,
        default=list,
        verbose_name="запрещённые слова",
        help_text="разделитель , (если пусто то не будет фильтровать)",
    )
    inn_advertiser = models.PositiveIntegerField(
        blank=True,
        default=0,
        verbose_name="ИНН рекламодателя",
        help_text="ИНН рекламодателя",
    )
    token_ord = models.CharField(
        blank=True, default="", verbose_name="Токен ОРД", help_text="Токен ОРД"
    )
    client = models.CharField(
        blank=True, default="", verbose_name="Рекламодатель", help_text="Клиент"
    )
    brand = models.CharField(default="", verbose_name="Бренд", help_text="Бренд")

    objects = CampaignQS.as_manager()

    def __str__(self):
        return self.name

    @property
    def is_fixed_slot(self) -> bool:
        return self.format == PlacementFormat.FIXED_SLOT

    class Meta:
        verbose_name_plural = "Кампании"
        verbose_name = "Кампания"
        ordering = ["-created_at"]

    # admin methods
    @property
    def total_clicks(self):
        return self.active_campaign_channels.aggregate(Sum("clicks", default=0))["clicks__sum"]

    @property
    def total_impressions_fact(self):
        return (
            self.active_campaign_channels.filter(publish_status=CampaignChannel.PublishStatusChoices.PUBLISHED).aggregate(Sum("impressions_fact", default=0))["impressions_fact__sum"]
        )

    @cached_property
    def total_views_fact_over_plan(self):
        return self.total_impressions_fact / self.total_planed_views() * 100 if self.total_planed_views() and self.total_impressions_fact else 0


    @property
    def total_ctr(self):
        val = "-"
        if self.total_clicks and self.total_impressions_fact:
            val = f"{self.total_clicks / self.total_impressions_fact * 100:.2f}%"
        return val

    @property
    def active_campaign_channels(self):
        return self.campaigns_channel.filter(channel__is_deleted=False)

    @property
    def active_channels(self):
        return self.channels.filter(is_deleted=False)

    @property
    def total_channels_count(self):
        return self.active_channels.distinct().count()

    @property
    def campaign_channels_count(self):
        """is_approved = true"""
        return (
            self.active_channels.filter(
                channel_campaigns__publish_status=CampaignChannel.PublishStatusChoices.PUBLISHED
            )
            .distinct()
            .count()
        )

    @property
    def total_channels_subs_count(self: Self):
        return (
            self.active_channels.distinct().aggregate(Sum("members_count"))[
                "members_count__sum"
            ]
            or 0
        )

    @property
    def my_channels_subs_count(self: Self):
        """is_approved true"""
        return (
            self.active_channels.filter(
                channel_campaigns__publish_status=CampaignChannel.PublishStatusChoices.PUBLISHED
            )
            .distinct()
            .aggregate(Sum("members_count"))["members_count__sum"]
            or 0
        )

    @property
    def total_channels_avg_posts_reach(self: Self):
        return (
            self.active_channels.aggregate(Sum("avg_posts_reach"))["avg_posts_reach__sum"] or 0
        )

    @property
    def my_channels_avg_posts_reach(self: Self):
        """is_approved true"""
        return (
            self.active_channels.filter(
                channel_campaigns__publish_status=CampaignChannel.PublishStatusChoices.PUBLISHED
            )
            .distinct()
            .aggregate(Sum("avg_posts_reach"))["avg_posts_reach__sum"]
            or 0
        )

    @property
    def total_channels_sov(self):
        """отношение планируемого количества показов к ёмкости каналов"""
        members_count, impressions_plan = self.active_channels.aggregate(
            Sum("members_count"), Sum("channel_campaigns__impressions_plan")
        ).values()
        return (
            f"{impressions_plan / members_count * 100:.2f}%"
            if impressions_plan and members_count
            else "0%"
        )

    @property
    def my_channels_sov(self):
        """is_approved = true"""
        members_count = (
            self.active_channels.filter(
                channel_campaigns__publish_status=CampaignChannel.PublishStatusChoices.PUBLISHED
            )
            .distinct()
            .aggregate(Sum("members_count"))["members_count__sum"]
        )
        """is_approved = true"""
        impressions_plan = (
            self.active_channels.filter(
                channel_campaigns__publish_status=CampaignChannel.PublishStatusChoices.PUBLISHED
            )
            .distinct()
            .aggregate(Sum("channel_campaigns__impressions_plan"))[
                "channel_campaigns__impressions_plan__sum"
            ]
        )
        return (
            f"{impressions_plan / members_count * 100:.2f}%"
            if impressions_plan and members_count
            else "0%"
        )

    def clean_wordsfilters(self: Self):
        if self.white_list and self.black_list:
            for word in self.white_list:
                if word.lower() in (i.lower() for i in self.black_list):
                    raise ValidationError(
                        {
                            "white_list": f"word: ({word}) is in both fields Разрешённые слова, Запрещённые слова",
                            "black_list": f"word: ({word}) is in both fields Разрешённые слова, Запрещённые слова",
                        },
                    )

    @admin.display(description="сред. СРМ (руб.) (среднее арифметическое значение)")
    def avg_cpm(self: Self):
        return (
            f"{self.active_campaign_channels.aggregate(Avg('cpm'))['cpm__avg']:.2f}"
            if self.active_campaign_channels.exists()
            else "-"
        )

    @admin.display(description="ПП")
    def total_planed_views(self):
        return (
            self.active_campaign_channels.filter(publish_status__in=[CampaignChannel.PublishStatusChoices.PUBLISHED, CampaignChannel.PublishStatusChoices.CONFIRMED]).aggregate(Sum('impressions_plan', default=0))['impressions_plan__sum']
            if self.active_campaign_channels.exists()
            else "-"
        )

    def clean_budget(self: Self) -> None:
        if not self.campaigns_channel.filter(
            channel__isnull=False, channel__is_deleted=False
        ).campaign_channels_total_budgets():
            return
        if (
            self.campaigns_channel.filter(
                channel__isnull=False, channel__is_deleted=False
            ).campaign_channels_total_budgets()
            > self.budget
        ):
            self.status = self.Statuses.PAUSED
            self.save()
            raise ValidationError(
                {
                    "budget": "Суммарный бюджет каналов больше чем указанный бюджет кампании"
                }
            )

    def clean_status(self: Self) -> None:
        if self.status == self.Statuses.ACTIVE:
            try:
                self.clean_budget()
            except ValidationError as e:
                raise ValidationError(
                    {
                        "status": "Невозможно активировать кампанию, некорректный бюджет",
                        **e.message_dict,
                    }
                )

    def clean_start_date(self):
        create = self._state.adding
        update = not create
        if create and self.start_date and self.start_date < timezone.now().date():
            raise ValidationError(
                {"start_date": "Дата старта не может быть раньше сегодняшнего дня"}
            )
        elif update and self.start_date and self.start_date < self.created_at.date():
            raise ValidationError(
                {"start_date": "Дата старта не может быть раньше даты создания"}
            )

    def clean_finish_date(self):
        if self.finish_date and self.finish_date < self.start_date:
            raise ValidationError(
                {"finish_date": "Дата окончания РК не может быть раньше даты старта"}
            )

    @cached_property
    def link_type_str(self: CampaignChannel):
        return  'TG-канал' if getattr(self, 'message', None) and self.message.is_external else 'Web'

    def clean(self: Self):
        super().clean()
        if self.pk:
            original_format = (
                Campaign.objects.filter(pk=self.pk)
                .values_list("format", flat=True)
                .first()
            )
            if original_format and original_format != self.format:
                raise ValidationError(
                    {"format": "Невозможно изменить формат после создания кампании."}
                )
        message_obj = None
        if self.message_id:
            message_obj = getattr(self, "_message_cache", None)
            if message_obj is None:
                message_obj = Message.objects.filter(pk=self.message_id).first()
            if not message_obj:
                raise ValidationError({"message": "Выбранный креатив не найден"})
            if message_obj.format != self.format:
                raise ValidationError(
                    {"message": "Формат кампании должен совпадать с форматом креатива."}
                )
        else:
            raise ValidationError({"message": "Выберите креатив для кампании."})

        self.clean_wordsfilters()
        if self.id:
            self.clean_status()
            self.clean_budget()

        self.clean_start_date()
        self.clean_finish_date()

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)


class CampaignChannel(ExportModelOperationsMixin("campaignchannel"), BaseModel):
    class PublishStatusChoices(models.TextChoices):
        PLANNED = "planned", _("Ожидает подтверждения")
        CONFIRMED = "confirmed", _("Подтверждено")
        PUBLISHED = "published", _("опубликовано")
        DELETED = "deleted", _("удалённо")  # to delete
        REJECTED = "rejected", _("Отклонено")

    channel = models.ForeignKey(
        "Channel",
        on_delete=models.CASCADE,
        verbose_name=_("Канал"),
        related_name="channel_campaigns",
    )
    campaign = models.ForeignKey(
        "Campaign",
        on_delete=models.CASCADE,
        verbose_name=_("Кампания"),
        related_name="campaigns_channel",
    )
    cpm = models.DecimalField(
        max_digits=8, decimal_places=2, verbose_name=_("СРМ (руб.)"), default=0
    )
    plan_cpm = models.DecimalField(
        max_digits=8, decimal_places=2, verbose_name=_("План. CPM"), default=0
    )
    impressions_plan = models.IntegerField(
        verbose_name=_("План. Количество показов"),
        default=0,
        help_text="рассчитывается как (Бюджет/СРМ)*1000",
    )
    impressions_fact = models.IntegerField(verbose_name=_("Показы-факт"), default=0)
    message_publish_date = models.DateTimeField(
        null=True, blank=True, verbose_name=_("Дата публикации")
    )
    publication_slot = models.ForeignKey(
        "ChannelPublicationSlot",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name=_("Слот публикации"),
        related_name="campaign_channels",
    )
    publish_status = models.CharField(
        verbose_name="Статус публикации",
        max_length=30,
        choices=PublishStatusChoices.choices,
        default=PublishStatusChoices.PLANNED,
    )
    channel_post_id = models.TextField(null=True, blank=True)
    clicks = models.PositiveIntegerField(
        default=0, help_text="clicks by users on the campaign", verbose_name="Клики"
    )
    channel_admin = models.ForeignKey(
        "ChannelAdmin",
        verbose_name="Админ",
        related_name="channel_campaigns",
        on_delete=models.SET_NULL,
        null=True,
    )
    objects = CampaignChannelQs.as_manager()

    @cached_property
    def link_type_str(self: CampaignChannel):
        if getattr(self, 'campaign', None):
            return  self.campaign.link_type_str
        return '-'

    @property
    def ctr(self):
        val = '-'
        if self.clicks and self.impressions_fact:
            val = self.clicks / self.impressions_fact * 100
        elif self.impressions_fact and self.clicks:
            val = 0
        return val

    @property
    def cpm_diff(self):
        return (1 - self.plan_cpm / self.cpm ) * 100 * -1 if self.plan_cpm and self.cpm else 0

    @property
    def budget(self):
        return self.cpm * self.impressions_fact / 1000 if self.cpm and self.impressions_fact else 0

    @property
    def is_message_published(self) -> bool:
        return self.publish_status == self.PublishStatusChoices.PUBLISHED

    @is_message_published.setter
    def is_message_published(self, val: bool):
        self.publish_status = (
            self.PublishStatusChoices.PUBLISHED
            if val
            else self.PublishStatusChoices.PLANNED
        )

    @property
    def is_approved(self) -> bool:
        return self.publish_status == self.PublishStatusChoices.CONFIRMED

    @is_approved.setter
    def is_approved(self, val: bool):
        self.publish_status = (
            self.PublishStatusChoices.CONFIRMED
            if val
            else self.PublishStatusChoices.REJECTED
        )

    def clean(self: Self):
        if not getattr(self, "channel", None):
            raise ValidationError({"channel": "Add Channel"})
        if self.channel and self.channel.is_deleted:
            raise ValidationError({"channel": "Канал помечен как удалён."})
        if self.id and not self.channel.is_active:
            raise ValidationError({"channel": "Channel not active"})
        if self.id and not getattr(self, "channel_admin", None):
            raise ValidationError(
                {"channel_admin": "Specify an admin for the campaign!"}
            )
        self.clean_add_to_campaign()
        self.clean_negative_fields()
        self.clean_publication_slot()

    def clean_negative_fields(self):
        fields = [
            "cpm",
            "impressions_plan",
            "impressions_fact",
        ]
        for field in fields:
            if getattr(self, field, 0) and getattr(self, field, 0) < 0:
                raise ValidationError(
                    {f"{field}": "Значение не может быть отрицательным"}
                )

    def clean_publication_slot(self):
        campaign = getattr(self, "campaign", None)
        slot = getattr(self, "publication_slot", None)
        channel = getattr(self, "channel", None)
        if campaign and campaign.format == PlacementFormat.FIXED_SLOT:
            if not slot:
                raise ValidationError({"publication_slot": "Выберите слот публикации"})
            if channel and slot.channel_id != channel.id:
                raise ValidationError(
                    {"publication_slot": "Слот принадлежит другому каналу"}
                )
        elif campaign and campaign.format != PlacementFormat.FIXED_SLOT:
            self.publication_slot = None

    def clean_add_to_campaign(self: Self):
        create = self._state.adding
        if getattr(self, 'campaign', None) and not self.campaign.finish_date:
            raise ValidationError({'finish_date': "это обязательное поле"})
        if getattr(self, 'campaign', None) and not self.campaign.start_date:
            raise ValidationError({'start_date': "это обязательное поле"})

        campaign = getattr(self, "campaign", None)
        if campaign and self.channel and not self.channel.supports_format(campaign.format):
            raise ValidationError(
                {
                    "channel": "Выбранный канал не поддерживает формат кампании."
                }
            )

        if (
            create
            and getattr(self, "campaign", None)
            and self.campaign.finish_date < timezone.now().date()
        ):
            raise ValidationError(
                {"channel": "Невозможно добавить канал в завершенную кампанию"}
            )

    def _sync_message_publish_date(self):
        campaign = getattr(self, "campaign", None)
        slot = getattr(self, "publication_slot", None)

        # Для Фикс-слота используем время из слота
        if campaign and campaign.format == PlacementFormat.FIXED_SLOT and slot:
            tz = timezone.get_current_timezone()
            # Берем дату старта кампании и время из слота
            scheduled = timezone.make_aware(
                datetime.combine(campaign.start_date, slot.start_time), tz
            )
            self.message_publish_date = scheduled
        elif campaign and campaign.format != PlacementFormat.FIXED_SLOT:
            self.message_publish_date = None

    def save(self, *args, **kwargs):
        self._sync_message_publish_date()
        super().save(*args, **kwargs)

    @property
    def budget_cpm(self):
        return (
            Decimal(self.impressions_plan / Decimal("1000") * self.cpm).quantize(
                Decimal("0.00")
            )
            if self.cpm and self.impressions_plan
            else 0
        )

    class Meta:
        verbose_name = "Статистика"
        verbose_name_plural = "Статистика"
        ordering = ["-created_at"]

    @property
    def path_click_analysis(self: Self):
        if (
            self.campaign
            and self.campaign.message
            and not self.campaign.message.is_external
        ):
            return f"/api/campaign-channel/{self.id}/click/"
        elif (
            self.campaign
            and self.campaign.message
            and self.campaign.message.is_external
        ):
            return self.campaign.message.button_link
        else:
            return "https://google.com"

    def url_click_analysis(self: Self, request: Request):
        return request._request.build_absolute_uri(self.path_click_analysis)

    @property
    @admin.display(description="Заработано", ordering="impressions_fact")
    def earned_money(self):
        return (
            (Decimal(self.impressions_fact / 1000) * self.cpm).quantize(Decimal("0.01"))
            if self.impressions_fact and self.cpm
            else 0
        )

    @property
    def budget_plan(self) -> Decimal:
        return self.cpm * self.impressions_plan

    @property
    def budget_fact(self) -> Decimal:
        return self.cpm * self.impressions_fact

    def __str__(self):
        return (
            f"Статистика: {self.campaign}"
            if getattr(self, "campaign", None)
            else "Статистика:"
        )

    @classmethod
    def cls_alter_campaign_activity(cls):
        return cls.objects.update_campaign_activity()
