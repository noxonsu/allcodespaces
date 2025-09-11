from django.contrib.auth import login
from django.contrib.auth.views import LoginView
from django.http import HttpResponsePermanentRedirect, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.views.generic import TemplateView
from django_filters.rest_framework.backends import DjangoFilterBackend
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from core.filterset_classes import CampaignChannelFilterSet
from core.models import Channel, Message, CampaignChannel, ChannelAdmin
from core.serializers import (
    ChannelSerializer,
    MessageSerializer,
    CampaignChannelSerializer,
    TGLoginSerializer,
    CampaignChannelClickSerializer,
    ChannelAdminSerializer,
)
from core.utils import get_template_side_data


class ChannelViewSet(ModelViewSet):
    queryset = Channel.objects.all()
    serializer_class = ChannelSerializer
    permission_classes = [AllowAny]
    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ["tg_id"]

    def get_object(self):
        if self.kwargs.get("id"):
            return get_object_or_404(self.get_queryset(), id=self.kwargs["id"])
        else:
            tg_id = self.request.data.get("tg_id", self.kwargs.get("pk"))
            return get_object_or_404(self.get_queryset(), tg_id=tg_id)

    @action(detail=True, methods=["PATCH"], url_name="bot-kicked")
    def bot_kicked(self, request, *args, **kwargs):
        self.lookup_field = "tg_id"
        model = super().get_object()
        model.is_bot_installed = False
        model.status = Channel.ChannelStatus.PENDING
        model.save()
        return self.get_serializer(instance=model).data

    @action(detail=False, methods=["POST"], description="public a message in a channel")
    def public(self, request, *args, **kwargs):
        instance = self.get_queryset().filter(tg_id=request.data["tg_id"]).first()
        campaign_id = request.data["campaign_id"]
        message_id = request.data["message_id"]

        to_public = instance.channel_campaigns.filter(
            campaign_id=campaign_id, message_id=message_id
        ).first()

        if to_public:
            data = {
                "public_id": str(to_public.id),
                "message": MessageSerializer(instance=to_public.message).data,
            }
            return Response(data=data, status=status.HTTP_200_OK)

        if instance and instance.is_active:
            msg = f"Приветствуем всех подписчиков канала {instance.name}."
            return Response({"msg": msg}, status.HTTP_200_OK)
        else:
            return Response("", status.HTTP_200_OK)

    @action(detail=False, methods=["PATCH"], description="Bot Leaves a channel")
    def leave(self, request, *args, **kwargs):
        """Proxy method"""
        return self.partial_update(request, *args, **kwargs)


class MessageViewSet(ModelViewSet):
    queryset = Message.objects.all()
    serializer_class = MessageSerializer
    permission_classes = [AllowAny]

    @action(
        detail=False,
        methods=["PUT", "PATCH"],
        url_name="bulk_update",
        url_path="update",
    )
    def bulk_update(self, request, *args, **kwargs):
        messages = self.get_serializer(
            data=request.data,
            many=True,
            partial=True,
            context=self.get_serializer_context(),
        )
        messages.is_valid(raise_exception=True)
        messages.save()
        return Response(data=messages.data, status=status.HTTP_200_OK)


class CampaignChannelViewSet(ModelViewSet):
    queryset = CampaignChannel.objects.all()
    serializer_class = CampaignChannelSerializer
    authentication_classes = []
    permission_classes = [AllowAny]
    filter_backends = (DjangoFilterBackend,)
    filterset_class = CampaignChannelFilterSet

    @action(methods=["POST"], detail=False, url_path="unpublished-campaigns")
    def unpublished_campaigns(self, request, *args, **kwargs):
        filter_class = self.filterset_class(request.data, queryset=self.get_queryset())
        return Response(
            data=self.get_serializer(instance=filter_class.qs, many=True).data,
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["GET"],
        authentication_classes=[],
        url_path="click",
        url_name="click",
    )
    def click(self, request, *args, **kwargs):
        instance: CampaignChannel = self.get_object()
        serializer = CampaignChannelClickSerializer(
            instance=instance,
            data=request.GET,
            partial=True,
            context=self.get_serializer_context(),
        )
        serializer.is_valid(raise_exception=False)
        if serializer.instance:
            serializer.save()
            return HttpResponsePermanentRedirect(
                redirect_to=instance.campaign.message.button_link
            )


class TGLoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    queryset = ChannelAdmin.objects.all()
    serializer_class = TGLoginSerializer

    def get(self, request):
        serializer = self.serializer_class(
            data=request.GET, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        channel_admin = serializer.save()
        login(request, channel_admin.user)
        return HttpResponsePermanentRedirect(redirect_to="/")


class ChannelAdminViewSet(ModelViewSet):
    queryset = ChannelAdmin.objects.all()
    serializer_class = ChannelAdminSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    @action(
        detail=False,
        methods=["PUT"],
        url_path="join",
        url_name="join",
        permission_classes=[AllowAny],
        authentication_classes=[],
    )
    def join(self, request, *args, **kwargs):
        instance = self.get_queryset().filter(tg_id=request.data["tg_id"]).first()
        serializer = self.get_serializer(
            instance=instance, data=request.data, context=self.get_serializer_context()
        )
        print(f"join VIEW  {request.data=}")
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(data=serializer.data, status=status.HTTP_200_OK)


class AboutView(TemplateView):
    template_name = "core/about.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user
        auth_hide_models = ['permission']
        apps_ = []
        core_hide_models = ['message', 'channeladmin', 'campaign', 'user']
        if user.is_owner:
            core_models = get_template_side_data('core', exclude=core_hide_models)
            apps_.append(core_models.app_models)
        else:
            core_models = get_template_side_data('core')
            apps_.append(core_models.app_models)
            celery_models = get_template_side_data(
                'django_celery_beat',
                nav_header_name='Периодические Задачи',
                exclude=['periodictasks'],
                permissions=['core.user_view']
            )
            auth_models = get_template_side_data(
                'auth',
                nav_header_name='Пользователи и группы',
                exclude=auth_hide_models,
                permissions=['core.add_user']
            )
            apps_.append(celery_models.app_models)
            apps_.append(auth_models.app_models)

        context["is_popup"] = False
        context.update(available_apps=apps_)
        context['title'] = 'О нас'
        context['is_popup'] = False

        return context



def user_get_redirect_url(user):
    next_page = '/core/campaignchannel/'
    if user.is_owner:
        next_page = '/core/channel/'
    return next_page


class CustomLoginView(LoginView):
    """Custom redirect user based on his role"""
    template_name = "admin/login.html"
    next_page = '/core/campaignchannel/'

    def get_success_url(self):
        return user_get_redirect_url(self.request.user) or self.get_default_redirect_url()



def index_view(request):
    if request.user.is_authenticated:
        url = user_get_redirect_url(request.user)
    else:
        url = '/core/campaignchannel/'

    return HttpResponseRedirect(url)