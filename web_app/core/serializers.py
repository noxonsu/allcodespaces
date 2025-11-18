from functools import cached_property

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
)
from core.utils import validate_channel_avtar_url


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

    class Meta:
        model = Channel
        fields = "__all__"
        extra_kwargs = {
            "meta": {"write_only": True},
            "is_deleted": {"read_only": True},
            "legal_entity": {"required": False},
        }

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


class MessageLinkSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()
    as_html = serializers.SerializerMethodField()

    def get_title(self, obj):
        return obj.button_str or ""

    def get_url(self, obj):
        return obj.button_link or ""

    def get_as_html(self, obj: Message):
        return f"<a href='{obj.button_link}'>{obj.button_str} </a>"

    class Meta:
        model = Message
        fields = [
            "id",
            "title",
            "url",
            "as_html",
        ]


class MessageSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField()
    image = serializers.FileField(use_url=False, required=False)
    video = serializers.FileField(use_url=False, required=False)
    button = MessageLinkSerializer(read_only=True, source="*")  # to embedd

    class Meta:
        model = Message
        fields = [
            "id",
            "name",
            "title",
            "body",
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

        button_str = attrs.get("button_str")
        if button_str is None and self.instance:
            button_str = self.instance.button_str

        button_link = attrs.get("button_link")
        if button_link is None and self.instance:
            button_link = self.instance.button_link

        if format_value == PlacementFormat.SPONSORSHIP:
            if body and len(body) > SPONSORSHIP_BODY_LENGTH_LIMIT:
                raise serializers.ValidationError(
                    {
                        "body": f"Для формата «Спонсорство» допустимо до {SPONSORSHIP_BODY_LENGTH_LIMIT} символов.",
                    }
                )
            if button_str and not button_link:
                raise serializers.ValidationError(
                    {
                        "button_link": "Для формата «Спонсорство» ссылка для кнопки обязательна.",
                    }
                )
            if button_link and not button_str:
                raise serializers.ValidationError(
                    {
                        "button_str": "Для формата «Спонсорство» укажите текст кнопки.",
                    }
                )
            buttons_count = 1 if button_link and button_str else 0
            if buttons_count > SPONSORSHIP_BUTTON_LIMIT:
                raise serializers.ValidationError(
                    {
                        "button_link": "Для формата «Спонсорство» допустима только одна кнопка.",
                    }
                )

        return attrs


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
    publication_slot = serializers.SerializerMethodField()

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

    def get_publication_slot(self, obj):
        slot = getattr(obj, "publication_slot", None)
        if not slot:
            return None
        return {
            "id": str(slot.id),
            "weekday": slot.get_weekday_display(),
            "start_time": slot.start_time.strftime("%H:%M"),
            "end_time": slot.end_time.strftime("%H:%M"),
            "label": slot.label,
        }


class CampaignChannelClickSerializer(serializers.Serializer):
    target = serializers.URLField(required=False, allow_blank=True, allow_null=True)

    def update(self, instance, validated_data):
        instance.clicks += 1
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
