from django.conf import settings
from django.templatetags.l10n import localize
from rest_framework import serializers
from core.models import Channel, Message, CampaignChannel, User, Campaign, ChannelAdmin


class ChannelSerializer(serializers.ModelSerializer):
    avatar = serializers.URLField(
        source='avatar_url',
        required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = Channel
        fields = '__all__'
        extra_kwargs = {
            'meta': {'write_only': True},
        }
    def create(self, validated_data):
        from core.external_clients import TGStatClient
        channel: Channel = Channel.objects.filter(tg_id=validated_data['tg_id']).first()
        if channel:
            channel.is_bot_installed = True
            channel.avatar_url = validated_data.get('avatar_url')
            channel.invitation_link = validated_data.get('invitation_link')
            channel.save()
        else:
            channel =  super().create(validated_data)
        service = TGStatClient()
        service.update_channel_info(channel=channel)
        service.update_channel_stat(channel=channel)
        return channel


class ListMessageSerializer(serializers.ListSerializer):
    def to_internal_value(self, data):
        model = self.child.Meta.model
        self.instance = model.objects.filter(
            id__in= list(map(lambda x: x.get('id'), data)),
        )
        return super().to_internal_value(data)

    def update(self, instance, validated_data,**kwargs):
        for instance_data in validated_data:
            row = instance.filter(id=instance_data['id']).first()
            for attr, value in instance_data.items():
                setattr(row, attr, value)
            row.save()
        return instance


class MessageLinkSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()
    as_html = serializers.SerializerMethodField()

    def get_title(self, obj):
        return obj.button_str or ''

    def get_url(self, obj):
        return obj.button_link or ''

    def get_as_html(self, obj: Message):
        return f"<a href='{obj.button_link}'>{obj.button_str} </a>"

    class Meta:
        model = Message
        fields = [
            'id',
            'title',
            'url',
            'as_html',
        ]


class MessageSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField()
    image = serializers.FileField(use_url=False, required=False)
    video = serializers.FileField(use_url=False, required=False)
    button = MessageLinkSerializer(read_only=True, source='*') # to embedd

    class Meta:
        model = Message
        fields = [
            'id',
            'name',
            'title',
            'body',
            'button',
            'as_text',
            'image',
            'video',
            'created_at',
            'updated_at',
        ]
        list_serializer_class = ListMessageSerializer

class CampaignSerializer(serializers.ModelSerializer):
    message = MessageSerializer()

    class Meta:
        model = Campaign
        fields = '__all__'


class ChannelAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChannelAdmin
        fields = '__all__'



class CampaignChannelSerializer(serializers.ModelSerializer):
    channel = ChannelSerializer()
    campaign = CampaignSerializer()
    channel_admin = ChannelAdminSerializer()

    class Meta:
        model = CampaignChannel
        fields = [
            'id',
            'channel',
            'created_at',
            'updated_at',
            'impressions_plan',
            'publish_status',
            'impressions_fact',
            'is_message_published',
            'message_publish_date',
            'channel_post_id',
            'cpm',
            'campaign',
            'channel_admin',
            'is_approved',
            'path_click_analysis',
        ]
        extra_kwargs = {
            'path_click_analysis': {'read_only': True}
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
    url = serializers.URLField(allow_null=True, )
    file_size = serializers.IntegerField(allow_null=True, )
    file_url = serializers.URLField(allow_null=True, )
    file_thumbnail_url = serializers.URLField(allow_null=True, )


class TGStatSerializerMessage(serializers.Serializer):
    id = serializers.IntegerField()
    # date = serializers.DateTimeField(required=False)
    views = serializers.IntegerField()
    link = serializers.CharField(required=False)
    channel_id = serializers.IntegerField()
    is_deleted = serializers.BooleanField()
    group_id = serializers.IntegerField(allow_null=True, )
    # text = serializers.CharField(allow_null=True)
    # media = TGStatSerializerMedia(allow_null=True, )


class TGStatSerializer(serializers.Serializer):
    status = serializers.CharField()
    response = TGStatSerializerMessage()

    def save(self, **kwargs):
        campaign_channel = kwargs.get('campaign_channel')
        campaign_channel.impressions_fact = self.validated_data['response'].get('views')
        campaign_channel.save()


class TGLoginSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='tg_id')
    username = serializers.CharField()
    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'last_name',
            'first_name',
        ]


    def save(self, **kwargs):
        channel_admin = ChannelAdmin.objects.filter(
            tg_id=self.validated_data['tg_id'],
            user__isnull=False
        ).first()
        if not channel_admin:
            ChannelAdmin.objects.filter(
                tg_id=self.validated_data['tg_id'],
            ).delete()
            return ChannelAdmin.objects.create(
                tg_id=self.validated_data['tg_id'],
                username=self.validated_data.get('username', self.validated_data['tg_id']),
                last_name=self.validated_data['last_name'],
                first_name=self.validated_data['first_name'],
            )
        return channel_admin

class TGChannelInfo(serializers.ModelSerializer):
    # id = serializers.IntegerField(source='tg_id')
    link = serializers.CharField(allow_null=True, allow_blank=True, source='invitation_link')
    username = serializers.CharField(allow_null=True, allow_blank=True)
    title = serializers.CharField(allow_null=True, allow_blank=True, source='name')
    about = serializers.CharField(allow_null=True, allow_blank=True)
    category = serializers.CharField(allow_null=True, allow_blank=True)
    country = serializers.CharField(allow_null=True, allow_blank=True)
    language = serializers.CharField(allow_null=True, allow_blank=True, default='', initial='')
    participants_count = serializers.IntegerField(allow_null=True, required=False, source='members_count')
    image640 = serializers.CharField(allow_null=True, allow_blank=True, source='avatar_url')

    def validate_link(self, link: str):
        if link and not link.startswith('http'):
            return f"https://{link}"
        if not link and self.instance and self.instance.avatar_url:
            return self.instance.avatar_url
        return link

    class Meta:
        model = Channel
        fields = [
            'link',
            'username',
            'title',
            'about',
            'category',
            'country',
            'language',
            'participants_count',
            'image640',
        ]


class TGChannelStat(serializers.ModelSerializer):
    # id = serializers.IntegerField(source='tg_id')
    username = serializers.CharField(allow_null=True, allow_blank=True)
    title = serializers.CharField(allow_null=True, allow_blank=True, source='name')
    participants_count = serializers.IntegerField(default=0,    source='members_count')
    avg_post_reach = serializers.FloatField(default=0, )
    er_percent = serializers.FloatField(default=0,     source='er', allow_null=True)
    err_percent = serializers.FloatField(default=0,    source='err', allow_null=True)
    err24_percent = serializers.FloatField(default=0,  source='err_24', allow_null=True)
    posts_count = serializers.IntegerField(default=0, )
    daily_reach = serializers.FloatField(default=0, )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        nullable_validated = ['er','err','err_24']
        for attr in nullable_validated:
            if attrs.get(attr, None) is None:
                attrs[attr] = 0
        return attrs


    class Meta:
        model = Channel
        fields = [
            # 'id',
            'username',
            'title',
            'participants_count',
            'avg_post_reach',
            'er_percent',
            'err_percent',
            'err24_percent',
            'posts_count',
            'daily_reach',
        ]



class ExporterSerializer(serializers.ModelSerializer):
    campaign = serializers.CharField(label='Название РК')
    channel = serializers.CharField(label='Канал')
    # message_publish_date = serializers.DateTimeField(format='%c', label='Дата публикации')
    message_publish_date = serializers.SerializerMethodField(label='Дата публикации')
    impressions_fact = serializers.IntegerField(label='Показы-факт')
    clicks = serializers.IntegerField(label='Заработано')
    earned_money = serializers.FloatField(label='Клики')
    is_approved = serializers.BooleanField(label='Разрешено')

    def get_message_publish_date(self, instance):
        return localize(value=instance.message_publish_date) if instance.message_publish_date else '-'


    class Meta:
        model = CampaignChannel
        fields = [
            'campaign',
            'channel',
            'message_publish_date',
            'impressions_fact',
            'clicks',
            'earned_money',
            'is_approved',
        ]

    def get_cols_names(self):
        return [self[field].label for field in self.fields]