from functools import cached_property
from decimal import Decimal

from django.templatetags.l10n import localize
from rest_framework import serializers
from web_app.app_settings import app_settings
from core.models import (
    Channel,
    Message,
    CampaignChannel,
    User,
    Campaign,
    ChannelAdmin,
    MessagePreviewToken,
    PlacementFormat,
    SPONSORSHIP_BODY_LENGTH_LIMIT,
    SPONSORSHIP_BUTTON_LIMIT,
    LegalEntity,
    ChannelTransaction,
    Payout,
    ChannelPublicationSlot,
)
from core.utils import validate_channel_avtar_url
from core.services import BalanceService, ChannelBalance


class LegalEntitySerializer(serializers.ModelSerializer):
    """
    CHANGE: Add LegalEntity serializer for API
    WHY: Required by ТЗ 1.2 - API support for legal entities
    QUOTE(ТЗ): "API-сериализаторы и базовые валидации"
    REF: issue #24
    """

    class Meta:
        model = LegalEntity
        fields = [
            "id",
            "name",
            "short_name",
            "inn",
            "kpp",
            "ogrn",
            "legal_address",
            "bank_name",
            "bank_bik",
            "bank_correspondent_account",
            "bank_account",
            "contact_person",
            "contact_phone",
            "contact_email",
            "status",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_inn(self, value):
        """Валидация ИНН"""
        if value:
            cleaned = value.strip()
            if len(cleaned) not in (10, 12):
                raise serializers.ValidationError(
                    "ИНН должен содержать 10 цифр для юрлиц или 12 для ИП"
                )
            if not cleaned.isdigit():
                raise serializers.ValidationError("ИНН должен содержать только цифры")
        return value


class ChannelBalanceSerializer(serializers.ModelSerializer):
    balance = serializers.SerializerMethodField()
    frozen = serializers.SerializerMethodField()
    available = serializers.SerializerMethodField()

    class Meta:
        model = Channel
        fields = [
            "id",
            "name",
            "tg_id",
            "status",
            "members_count",
            "balance",
            "frozen",
            "available",
        ]

    def _get_balance(self, obj: Channel) -> ChannelBalance:
        balances = self.context.get("balances")
        if balances is not None:
            cached = balances.get(str(obj.id))
            if cached:
                return cached
        return BalanceService.calculate_balance(obj)

    def get_balance(self, obj: Channel):
        return self._get_balance(obj).balance

    def get_frozen(self, obj: Channel):
        return self._get_balance(obj).frozen

    def get_available(self, obj: Channel):
        return self._get_balance(obj).available


class LegalEntityDetailSerializer(LegalEntitySerializer):
    total_balance = serializers.SerializerMethodField()
    total_frozen = serializers.SerializerMethodField()
    total_available = serializers.SerializerMethodField()
    channels_count = serializers.SerializerMethodField()

    class Meta(LegalEntitySerializer.Meta):
        fields = LegalEntitySerializer.Meta.fields + [
            "total_balance",
            "total_frozen",
            "total_available",
            "channels_count",
        ]

    def _calc_totals(self, obj: LegalEntity) -> ChannelBalance:
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

    def get_total_balance(self, obj: LegalEntity):
        return self._calc_totals(obj).balance

    def get_total_frozen(self, obj: LegalEntity):
        return self._calc_totals(obj).frozen

    def get_total_available(self, obj: LegalEntity):
        return self._calc_totals(obj).available

    def get_channels_count(self, obj: LegalEntity):
        return obj.channels.filter(is_deleted=False).count()

    def validate_kpp(self, value):
        """Валидация КПП"""
        if value:
            cleaned = value.strip()
            if len(cleaned) != 9:
                raise serializers.ValidationError("КПП должен содержать 9 символов")
        return value

    def validate_bank_bik(self, value):
        """Валидация БИК"""
        if value:
            cleaned = value.strip()
            if len(cleaned) != 9:
                raise serializers.ValidationError("БИК должен содержать 9 цифр")
            if not cleaned.isdigit():
                raise serializers.ValidationError("БИК должен содержать только цифры")
        return value

    def validate_bank_account(self, value):
        """Валидация расчётного счёта"""
        if value:
            cleaned = value.strip()
            if len(cleaned) != 20:
                raise serializers.ValidationError(
                    "Расчётный счёт должен содержать 20 цифр"
                )
            if not cleaned.isdigit():
                raise serializers.ValidationError(
                    "Расчётный счёт должен содержать только цифры"
                )
        return value


class PayoutSerializer(serializers.ModelSerializer):
    legal_entity_detail = LegalEntitySerializer(source="legal_entity", read_only=True)

    class Meta:
        model = Payout
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at", "legal_entity_detail"]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Сумма должна быть положительной")
        return value

    def validate(self, attrs):
        period_start = attrs.get("period_start")
        period_end = attrs.get("period_end")
        if period_start and period_end and period_end < period_start:
            raise serializers.ValidationError({"period_end": "Дата окончания должна быть не раньше даты начала"})

        legal_entity = attrs.get("legal_entity") or getattr(self.instance, "legal_entity", None)
        amount = attrs.get("amount")
        if legal_entity and amount is not None:
            totals = BalanceService.get_legal_entity_balance(legal_entity)
            if totals.available < amount:
                raise serializers.ValidationError({"amount": "Сумма выплаты превышает доступный баланс юрлица"})

        supported_formats = attrs.get("supported_formats")
        if supported_formats is None and self.instance:
            supported_formats = self.instance.supported_formats

        autopilot_interval = attrs.get("autopilot_min_interval")
        if autopilot_interval is None and self.instance:
            autopilot_interval = self.instance.autopilot_min_interval

        if supported_formats and PlacementFormat.AUTOPILOT in supported_formats and not autopilot_interval:
            raise serializers.ValidationError(
                {"autopilot_min_interval": "Для каналов с форматом «Автопилот» укажите минимальный интервал."}
            )

        return attrs


class ChannelPublicationSlotSerializer(serializers.ModelSerializer):
    weekday_display = serializers.CharField(source="get_weekday_display", read_only=True)
    label = serializers.CharField(source="label", read_only=True)

    class Meta:
        model = ChannelPublicationSlot
        fields = ["id", "weekday", "weekday_display", "start_time", "end_time", "label"]
        read_only_fields = fields


class ChannelSerializer(serializers.ModelSerializer):
    avatar = serializers.URLField(
        source="avatar_url", required=False, allow_blank=True, allow_null=True, default='/static/custom/default.jpg'
    )
    # CHANGE: Добавляем поле admins для приёма списка администраторов
    # WHY: Нужно привязать канал к владельцу (ChannelAdmin)
    # REF: issue #55
    admins = serializers.ListField(write_only=True, required=False, allow_empty=True)

    # CHANGE: Добавляем вложенное представление юрлица для чтения
    # WHY: Required by ТЗ 1.2.2 - API должен возвращать данные юрлица
    # REF: issue #25
    legal_entity_detail = LegalEntitySerializer(source="legal_entity", read_only=True)

    # CHANGE: Возвращаем рассчитанные значения баланса канала
    # WHY: ТЗ 1.1.3 — показать баланс/заморозку/доступно в API
    # REF: issue #23
    balance = serializers.SerializerMethodField()
    frozen = serializers.SerializerMethodField()
    available = serializers.SerializerMethodField()
    publication_slots = ChannelPublicationSlotSerializer(many=True, read_only=True)

    class Meta:
        model = Channel
        fields = "__all__"
        extra_kwargs = {
            "meta": {"write_only": True},
            "is_deleted": {"read_only": True},
            "legal_entity": {"required": False},
        }
        read_only_fields = ["balance", "frozen", "available"]

    # region Balance helpers
    def _get_balance(self, obj: Channel) -> ChannelBalance:
        """Fetch balance once per object using BalanceService cache"""
        balance_attr = "_balance_cache"
        cached = getattr(obj, balance_attr, None)
        if cached:
            return cached

        balance = BalanceService.calculate_balance(obj)
        setattr(obj, balance_attr, balance)
        return balance

    def get_balance(self, obj: Channel):
        return self._get_balance(obj).balance

    def get_frozen(self, obj: Channel):
        return self._get_balance(obj).frozen

    def get_available(self, obj: Channel):
        return self._get_balance(obj).available
    # endregion

    def create(self, validated_data):
        from core.external_clients import TGStatClient
        import requests
        from web_app.app_settings import app_settings
        from web_app.logger import logger

        # CHANGE: Извлекаем список админов из validated_data
        admins_list = validated_data.pop("admins", [])

        channel: Channel = Channel.objects.filter(tg_id=validated_data["tg_id"]).first()
        if channel:
            channel.is_bot_installed = True
            channel.status = validated_data.get("status", Channel.ChannelStatus.PENDING)
            channel.avatar_url = validated_data.get("avatar_url")
            channel.invitation_link = validated_data.get("invitation_link")
            channel.is_deleted = False
            channel.save()
        else:
            channel = super().create(validated_data)

        # CHANGE: Привязываем канал к владельцу (creator) из списка админов
        # WHY: Без привязки канал не отображается в ЛК владельца
        # REF: issue #55
        logger.info(f"Processing channel admins. Received {len(admins_list)} admins")
        if admins_list:
            # Ищем creator (владельца канала)
            creator = next((a for a in admins_list if a.get("status") == "creator"), None)
            logger.info(f"Found creator: {creator}")
            # Если creator не найден, берём первого админа
            if not creator and admins_list:
                creator = admins_list[0]
                logger.info(f"No creator found, using first admin: {creator}")

            if creator and creator.get("user_id"):
                logger.info(f"Looking for ChannelAdmin with tg_id={creator.get('user_id')}")
                channel_admin = ChannelAdmin.objects.filter(
                    tg_id=str(creator["user_id"])
                ).first()

                if not channel_admin:
                    # CHANGE: Автоматически создаём ChannelAdmin если не существует
                    # WHY: Пользователь может добавить бота в канал без предварительного /start
                    # REF: issue #55
                    logger.info(f"ChannelAdmin not found, creating new one for tg_id={creator.get('user_id')}")
                    channel_admin = ChannelAdmin.objects.create(
                        tg_id=str(creator["user_id"]),
                        username=creator.get("username") or str(creator["user_id"]),
                        first_name=creator.get("first_name", ""),
                        last_name=creator.get("last_name", ""),
                        role=ChannelAdmin.Role.OWNER,
                        is_bot_installed=True
                    )
                    logger.info(f"✅ Created new ChannelAdmin: {channel_admin.username} (id={channel_admin.id})")

                logger.info(f"Found ChannelAdmin: {channel_admin.username} (id={channel_admin.id})")
                if channel not in channel_admin.channels.all():
                    channel_admin.channels.add(channel)
                    logger.info(f"✅ Linked channel {channel.name} (id={channel.id}) to ChannelAdmin {channel_admin.username} (tg_id={channel_admin.tg_id})")

                    # CHANGE: Отправляем уведомление админу о добавлении канала
                    # WHY: Пользователь должен получить подтверждение что канал добавлен
                    # REF: issue #55
                    try:
                        notification_text = (
                            f"✅ Канал <b>{channel.name}</b> успешно добавлен!\n\n"
                            f"Статус: Ожидает модерации\n"
                            f"Вы можете управлять каналом в личном кабинете: {app_settings.DOMAIN_URI}"
                        )
                        requests.post(
                            f"{app_settings.DOMAIN_URI}/telegram/channeladmin-added",
                            json={"tg_id": channel_admin.tg_id, "msg": notification_text},
                            timeout=10
                        )
                        logger.info(f"Sent notification to {channel_admin.username} about channel {channel.name}")
                    except Exception as e:
                        logger.error(f"Failed to send notification: {e}")
                else:
                    logger.info(f"Channel {channel.name} already linked to ChannelAdmin {channel_admin.username}")
            else:
                logger.warning(f"No valid creator found in admins_list")
        else:
            logger.warning(f"No admins_list provided for channel {channel.name}")

        service = TGStatClient()
        service.update_channel_info(channel=channel)
        service.update_channel_stat(channel=channel)

        return channel

    def validate_avatar(self, url):
        from core.utils import validate_channel_avtar_url
        return validate_channel_avtar_url(url)



class ListMessageSerializer(serializers.ListSerializer):
    def to_internal_value(self, data):
        model = self.child.Meta.model
        self.instance = model.objects.filter(
            id__in=list(map(lambda x: x.get("id"), data)),
        )
        return super().to_internal_value(data)

    def update(self, instance, validated_data, **kwargs):
        for instance_data in validated_data:
            row = instance.filter(id=instance_data["id"]).first()
            for attr, value in instance_data.items():
                setattr(row, attr, value)
            row.save()
        return instance


class MessageLinkSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    title = serializers.CharField()
    url = serializers.URLField()


class MessageSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField()
    image = serializers.FileField(use_url=False, required=False)
    video = serializers.FileField(use_url=False, required=False)
    buttons = serializers.ListField(child=serializers.DictField(), required=False)
    button = serializers.SerializerMethodField()
    body = serializers.CharField()

    class Meta:
        model = Message
        fields = [
            "id",
            "name",
            "title",
            "body",
            "buttons",
            "button",
            "as_text",
            "image",
            "video",
            "format",
            "is_external",
            "created_at",
            "updated_at",
        ]
        list_serializer_class = ListMessageSerializer

    def validate(self, attrs):
        format_value = attrs.get("format")
        if format_value is None and self.instance:
            format_value = self.instance.format

        body = attrs.get("body")
        if body is None and self.instance:
            body = self.instance.body

        buttons = attrs.get("buttons")
        if buttons is None and self.instance:
            buttons = getattr(self.instance, "buttons", [])

        if buttons is not None:
            if not isinstance(buttons, list):
                raise serializers.ValidationError({"buttons": "Кнопки должны быть списком."})
            if any(not isinstance(btn, dict) for btn in buttons):
                raise serializers.ValidationError({"buttons": "Каждая кнопка должна быть объектом."})
            if len(buttons) > 8:
                raise serializers.ValidationError({"buttons": "Максимум 8 кнопок."})
            for idx, btn in enumerate(buttons):
                if not btn.get("text") or not btn.get("url"):
                    raise serializers.ValidationError({"buttons": f"Кнопка #{idx+1}: текст и ссылка обязательны."})

        if format_value == PlacementFormat.SPONSORSHIP:
            if body and len(body) > SPONSORSHIP_BODY_LENGTH_LIMIT:
                raise serializers.ValidationError(
                    {
                        "body": f"Для формата «Спонсорство» допустимо до {SPONSORSHIP_BODY_LENGTH_LIMIT} символов.",
                    }
                )
            if buttons and len(buttons) > SPONSORSHIP_BUTTON_LIMIT:
                raise serializers.ValidationError(
                    {"buttons": "Для формата «Спонсорство» допустима только одна кнопка."}
                )
        if format_value == PlacementFormat.FIXED_SLOT and buttons is not None:
            if len(buttons) == 0:
                raise serializers.ValidationError(
                    {"buttons": "Для формата «Фикс-слот» добавьте хотя бы одну кнопку."}
                )

        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        body_value = getattr(instance, "body", "")
        if body_value:
            data["body_html"] = body_value
        return data

    def get_button(self, instance: Message):
        btn = instance.primary_button
        if not btn:
            return None
        return {"title": btn.get("text"), "url": btn.get("url")}


class MessagePreviewTokenSerializer(serializers.ModelSerializer):
    deep_link = serializers.SerializerMethodField()

    class Meta:
        model = MessagePreviewToken
        fields = ["token", "expires_at", "deep_link"]

    def get_deep_link(self, obj: MessagePreviewToken) -> str:
        return f"https://t.me/{app_settings.TELEGRAM_BOT_USERNAME}?start={obj.token}"


class MessagePreviewResolveSerializer(serializers.Serializer):
    token = serializers.CharField()


class CampaignSerializer(serializers.ModelSerializer):
    message = MessageSerializer()
    format_display = serializers.CharField(
        source="get_format_display", read_only=True
    )
    status_display = serializers.CharField(
        source="get_status_display", read_only=True
    )

    class Meta:
        model = Campaign
        fields = "__all__"


class ChannelAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChannelAdmin
        fields = "__all__"


class CampaignChannelSerializer(serializers.ModelSerializer):
    channel = ChannelSerializer()
    campaign = CampaignSerializer()
    channel_admin = ChannelAdminSerializer()
    publication_slot = ChannelPublicationSlotSerializer(read_only=True)

    class Meta:
        model = CampaignChannel
        fields = [
            "id",
            "channel",
            "created_at",
            "updated_at",
            "impressions_plan",
            "publish_status",
            "impressions_fact",
            "is_message_published",
            "message_publish_date",
            "publication_slot",
            "channel_post_id",
            "cpm",
            "plan_cpm",
            "campaign",
            "channel_admin",
            "is_approved",
            "path_click_analysis",
        ]
        extra_kwargs = {"path_click_analysis": {"read_only": True}, 'plan_cpm': {'required': False}}

    def validate(self, attrs):
        campaign = None
        if self.instance and getattr(self.instance, "campaign", None):
            campaign = self.instance.campaign
        elif "campaign" in attrs:
            campaign = attrs.get("campaign")

        if campaign and campaign.status == Campaign.Statuses.DRAFT:
            raise serializers.ValidationError(
                {
                    "campaign": "Кампания в статусе «Черновик»: операции с каналами недоступны."
                }
            )

        return super().validate(attrs)

class CampaignChannelClickSerializer(serializers.Serializer):
    target = serializers.URLField(required=False, allow_blank=True, allow_null=True)
    button_index = serializers.IntegerField(required=False, allow_null=True)

    def update(self, instance, validated_data):
        instance.clicks += 1
        button_index = validated_data.get("button_index")
        if button_index is not None:
            clicks = instance.button_clicks or {}
            key = str(button_index)
            clicks[key] = clicks.get(key, 0) + 1
            instance.button_clicks = clicks
        instance.save()
        return instance


class TGStatSerializerMedia(serializers.Serializer):
    type = serializers.CharField()
    title = serializers.CharField()
    url = serializers.URLField(
        allow_null=True,
    )
    file_size = serializers.IntegerField(
        allow_null=True,
    )
    file_url = serializers.URLField(
        allow_null=True,
    )
    file_thumbnail_url = serializers.URLField(
        allow_null=True,
    )


class TGStatSerializerMessage(serializers.Serializer):
    id = serializers.IntegerField()
    # date = serializers.DateTimeField(required=False)
    views = serializers.IntegerField()
    link = serializers.CharField(required=False)
    channel_id = serializers.IntegerField()
    is_deleted = serializers.BooleanField()
    group_id = serializers.IntegerField(
        allow_null=True,
    )
    # text = serializers.CharField(allow_null=True)
    # media = TGStatSerializerMedia(allow_null=True, )


class TGStatSerializer(serializers.Serializer):
    status = serializers.CharField()
    response = TGStatSerializerMessage()

    def save(self, **kwargs):
        campaign_channel = kwargs.get("campaign_channel")
        campaign_channel.impressions_fact = self.validated_data["response"].get("views")
        campaign_channel.save()


class TGLoginSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="tg_id")
    username = serializers.CharField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "last_name",
            "first_name",
        ]

    def save(self, **kwargs):
        channel_admin = ChannelAdmin.objects.filter(
            tg_id=self.validated_data["tg_id"], user__isnull=False
        ).first()
        if not channel_admin:
            ChannelAdmin.objects.filter(
                tg_id=self.validated_data["tg_id"],
            ).delete()
            return ChannelAdmin.objects.create(
                tg_id=self.validated_data["tg_id"],
                username=self.validated_data.get(
                    "username", self.validated_data["tg_id"]
                ),
                last_name=self.validated_data.get("last_name", ""),
                first_name=self.validated_data.get("first_name", ""),
            )
        return channel_admin


class TGChannelInfo(serializers.ModelSerializer):
    # id = serializers.IntegerField(source='tg_id')
    link = serializers.CharField(
        allow_null=True, allow_blank=True, source="invitation_link"
    )
    username = serializers.CharField(allow_null=True, allow_blank=True)
    title = serializers.CharField(allow_null=True, allow_blank=True, source="name")
    about = serializers.CharField(allow_null=True, allow_blank=True)
    category = serializers.CharField(allow_null=True, allow_blank=True)
    country = serializers.CharField(allow_null=True, allow_blank=True)
    language = serializers.CharField(
        allow_null=True, allow_blank=True, default="", initial=""
    )
    participants_count = serializers.IntegerField(
        allow_null=True, required=False, source="members_count"
    )
    image640 = serializers.CharField(
        allow_null=True, allow_blank=True, source="avatar_url", default='/static/custom/default.jpg'
    )

    def validate_link(self, link: str):
        if link and not link.startswith("http"):
            return f"https://{link}"
        if not link and self.instance and self.instance.avatar_url:
            return self.instance.avatar_url
        return link

    def validate_image640(self, image_url: str):
        try:
             return validate_channel_avtar_url(image_url)
        except:
            return '/static/custom/default.jpg' if not image_url.startswith('https') or not image_url.startswith('//static')   else image_url


    class Meta:
        model = Channel
        fields = [
            "link",
            "username",
            "title",
            "about",
            "category",
            "country",
            "language",
            "participants_count",
            "image640",
        ]


class TGChannelStat(serializers.ModelSerializer):
    # id = serializers.IntegerField(source='tg_id')
    username = serializers.CharField(allow_null=True, allow_blank=True)
    title = serializers.CharField(allow_null=True, allow_blank=True, source="name")
    participants_count = serializers.IntegerField(default=0, source="members_count")
    avg_post_reach = serializers.FloatField(
        default=0,
    )
    er_percent = serializers.FloatField(default=0, source="er", allow_null=True)
    err_percent = serializers.FloatField(default=0, source="err", allow_null=True)
    err24_percent = serializers.FloatField(default=0, source="err_24", allow_null=True)
    posts_count = serializers.IntegerField(
        default=0,
    )
    daily_reach = serializers.FloatField(
        default=0,
    )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        nullable_validated = ["er", "err", "err_24"]
        for attr in nullable_validated:
            if attrs.get(attr, None) is None:
                attrs[attr] = 0
        return attrs

    class Meta:
        model = Channel
        fields = [
            # 'id',
            "username",
            "title",
            "participants_count",
            "avg_post_reach",
            "er_percent",
            "err_percent",
            "err24_percent",
            "posts_count",
            "daily_reach",
        ]


class ExporterSerializer(serializers.ModelSerializer):
    campaign = serializers.CharField(label="Название РК")
    channel = serializers.CharField(label="Канал")
    message_publish_date = serializers.SerializerMethodField(label="Дата публикации")
    impressions_fact = serializers.IntegerField(label="Показы")
    clicks = serializers.IntegerField(label="Заработано")
    earned_money = serializers.FloatField(label="Клики")
    publish_status = serializers.CharField(label="Статус публикации", source='get_publish_status_display')

    def get_message_publish_date(self, instance):
        return (
            localize(value=instance.message_publish_date)
            if instance.message_publish_date
            else "-"
        )


    class Meta:
        model = CampaignChannel
        fields = [
            "campaign",
            "channel",
            "message_publish_date",
            "impressions_fact",
            "clicks",
            "earned_money",
            "publish_status",
        ]
        _owner_fields = [
            "channel",
            "message_publish_date",
            "impressions_fact",
            "clicks",
            "earned_money",
            "publish_status",
        ]

    def get_cols_names(self):
        return [self[field].label for field in self.fields]

    @cached_property
    def fields(self):
        res = super().fields
        if self.context and "user" in self.context:
            user = self.context["user"]
            if user.groups.filter(
                name__in=[ChannelAdmin.Role.OWNER, "owners"]
            ).exists():
                owner_fields = {}
                for key in res:
                    if key in self.Meta._owner_fields:
                        owner_fields[key] = res[key]
                return owner_fields
        return res


class ChannelTransactionSerializer(serializers.ModelSerializer):
    """
    CHANGE: Refactored for Event Sourcing - removed status and completed_at fields
    WHY: Event Sourcing approach - transactions are append-only, no statuses
    QUOTE(ТЗ): "Event Sourcing - баланс = SUM(transactions). Нет race — только append"
    REF: issue #22 (refactoring)
    """
    channel_name = serializers.CharField(source="channel.name", read_only=True)
    transaction_type_display = serializers.CharField(
        source="get_transaction_type_display", read_only=True
    )

    class Meta:
        model = ChannelTransaction
        fields = [
            "id",
            "channel",
            "channel_name",
            "transaction_type",
            "transaction_type_display",
            "amount",
            "currency",
            "source_type",
            "source_id",
            "description",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        """Validate transaction data using model's clean method"""
        instance = ChannelTransaction(**attrs)
        instance.clean()
        return attrs
