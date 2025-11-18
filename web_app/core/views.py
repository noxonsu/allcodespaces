import secrets
from datetime import timedelta

import requests
from django.contrib.auth import login
from django.contrib.auth.views import LoginView
from django.http import HttpResponsePermanentRedirect, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.views.generic import TemplateView
from django.db.models import Q
from django_filters.rest_framework.backends import DjangoFilterBackend
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet
from django.utils import timezone

from core.filterset_classes import CampaignChannelFilterSet
from core.models import Channel, Message, CampaignChannel, ChannelAdmin, MessagePreviewToken, UserLoginToken, LegalEntity, Payout
from core.serializers import (
    ChannelSerializer,
    MessageSerializer,
    CampaignChannelSerializer,
    TGLoginSerializer,
    CampaignChannelClickSerializer,
    ChannelAdminSerializer,
    MessagePreviewTokenSerializer,
    MessagePreviewResolveSerializer,
    LegalEntitySerializer,
    LegalEntityDetailSerializer,
    ChannelBalanceSerializer,
    PayoutSerializer,
)
from core.services import BalanceService
from core.utils import get_template_side_data
from web_app.app_settings import app_settings


class ChannelViewSet(ModelViewSet):
    queryset = Channel.objects.all()
    serializer_class = ChannelSerializer
    permission_classes = [AllowAny]
    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ["tg_id"]

    def get_queryset(self):
        qs = super().get_queryset()
        if not getattr(self.request, "user", None) or not self.request.user.is_superuser:
            return qs.filter(is_deleted=False)
        return qs

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

    def get_permissions(self):
        if getattr(self, "action", None) in {"preview"}:
            permission_classes = [IsAuthenticated]
        else:
            permission_classes = self.permission_classes
        return [permission() for permission in permission_classes]

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

    @action(
        detail=True,
        methods=["POST"],
        url_path="preview",
        permission_classes=[IsAuthenticated],
    )
    def preview(self, request, *args, **kwargs):
        message = self.get_object()
        user = request.user
        if not user.has_perm("core.view_message"):
            return Response({"detail": "Недостаточно прав"}, status=status.HTTP_403_FORBIDDEN)

        expires_at = timezone.now() + timedelta(minutes=30)
        preview_token = MessagePreviewToken.objects.create(
            token=secrets.token_urlsafe(32),
            message=message,
            created_by=user,
            expires_at=expires_at,
        )

        bot_response_status = None
        try:
            response = requests.post(
                f"{app_settings.DOMAIN_URI}/telegram/preview-token",
                json={"token": preview_token.token, "message_id": str(message.id)},
                timeout=15,
            )
            bot_response_status = response.status_code
        except Exception:
            bot_response_status = None

        data = MessagePreviewTokenSerializer(instance=preview_token).data
        data["bot_response_status"] = bot_response_status
        return Response(data=data, status=status.HTTP_201_CREATED)

    @action(
        detail=False,
        methods=["POST"],
        url_path="preview/resolve",
        permission_classes=[AllowAny],
        authentication_classes=[],
    )
    def resolve(self, request, *args, **kwargs):
        serializer = MessagePreviewResolveSerializer(
            data=request.data, context=self.get_serializer_context()
        )
        serializer.is_valid(raise_exception=True)
        token_value = serializer.validated_data["token"]

        token_instance = MessagePreviewToken.objects.filter(
            token=token_value
        ).select_related("message").first()
        if not token_instance:
            return Response({"detail": "Токен не найден"}, status=status.HTTP_404_NOT_FOUND)
        if token_instance.is_used:
            return Response({"detail": "Токен уже использован"}, status=status.HTTP_410_GONE)
        if token_instance.is_expired:
            return Response({"detail": "Срок действия токена истёк"}, status=status.HTTP_410_GONE)

        token_instance.used_at = timezone.now()
        token_instance.save(update_fields=["used_at", "updated_at"])
        message_data = MessageSerializer(
            instance=token_instance.message,
            context=self.get_serializer_context(),
        ).data
        return Response(
            data={"message": message_data, "token": token_instance.token},
            status=status.HTTP_200_OK,
        )


class CampaignChannelViewSet(ModelViewSet):
    queryset = CampaignChannel.objects.select_related("channel").filter(
        channel__is_deleted=False
    )
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
            # redirect to requested button or first
            buttons = instance.campaign.message.buttons or []
            button_index = serializer.validated_data.get("button_index")
            target_btn = None
            if button_index is not None and 0 <= button_index < len(buttons):
                target_btn = buttons[button_index]
            elif buttons:
                target_btn = buttons[0]

            target_url = target_btn.get("url") if target_btn else instance.campaign.message.button_link
            return HttpResponsePermanentRedirect(
                redirect_to=target_url
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


class LegalEntityViewSet(ModelViewSet):
    queryset = LegalEntity.objects.all()
    serializer_class = LegalEntitySerializer
    permission_classes = [AllowAny]
    filter_backends = (DjangoFilterBackend,)

    def get_serializer_class(self):
        if getattr(self, "action", None) == "retrieve":
            return LegalEntityDetailSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["GET"], url_path="channels")
    def channels(self, request, *args, **kwargs):
        legal_entity = self.get_object()
        qs = legal_entity.channels.filter(is_deleted=False)

        search = request.query_params.get("search")
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(username__icontains=search))

        ordering = request.query_params.get("ordering") or "name"
        allowed_ordering = {"name", "-name", "members_count", "-members_count", "created_at", "-created_at"}
        if ordering in allowed_ordering:
            qs = qs.order_by(ordering)

        page = self.paginate_queryset(qs)
        target_qs = page if page is not None else qs
        balances = BalanceService.get_balance_for_channels(list(target_qs))

        serializer = ChannelBalanceSerializer(
            target_qs,
            many=True,
            context={"balances": balances},
        )

        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response({"count": len(serializer.data), "results": serializer.data})


class PayoutViewSet(ModelViewSet):
    queryset = Payout.objects.select_related("legal_entity")
    serializer_class = PayoutSerializer
    permission_classes = [AllowAny]
    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ["legal_entity", "status", "currency"]


def user_get_redirect_url(user):
    next_page = '/admin/core/campaignchannel/'
    if user.is_owner:
        next_page = '/admin/core/channel/'
    return next_page


class CustomLoginView(LoginView):
    """Custom redirect user based on his role"""
    template_name = "admin/login.html"
    next_page = '/admin/core/campaignchannel/'

    def get_success_url(self):
        return user_get_redirect_url(self.request.user) or self.get_default_redirect_url()



def index_view(request):
    if request.user.is_authenticated:
        url = user_get_redirect_url(request.user)
    else:
        url = '/admin/'

    return HttpResponseRedirect(url)


class LoginAsUserView(APIView):
    """
    CHANGE: Добавлен view для авторизации по токену
    WHY: Позволить суперадминам входить под другими пользователями через временный токен
    REF: User request
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        token_value = request.GET.get('token')

        if not token_value:
            return Response(
                {"detail": "Токен не предоставлен"},
                status=status.HTTP_400_BAD_REQUEST
            )

        token_instance = UserLoginToken.objects.filter(
            token=token_value
        ).select_related("user").first()

        if not token_instance:
            return Response(
                {"detail": "Токен не найден"},
                status=status.HTTP_404_NOT_FOUND
            )

        if token_instance.is_used:
            return Response(
                {"detail": "Токен уже использован"},
                status=status.HTTP_410_GONE
            )

        if token_instance.is_expired:
            return Response(
                {"detail": "Срок действия токена истёк"},
                status=status.HTTP_410_GONE
            )

        # Отмечаем токен как использованный
        token_instance.used_at = timezone.now()
        token_instance.save(update_fields=["used_at", "updated_at"])

        # Авторизуем пользователя
        login(request, token_instance.user)

        # Редирект на главную или профиль
        return HttpResponseRedirect(redirect_to=user_get_redirect_url(token_instance.user))
