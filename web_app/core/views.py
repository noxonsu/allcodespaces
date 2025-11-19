import secrets
from datetime import timedelta

import requests
from django.contrib.auth import login
from django.contrib.auth.views import LoginView
from django.core.files.base import ContentFile
from django.db.models import Q
from django.http import HttpResponsePermanentRedirect, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.generic import TemplateView
from django_filters.rest_framework.backends import DjangoFilterBackend
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from core.filterset_classes import CampaignChannelFilterSet
from core.media_plan import MediaPlanGenerator, MediaPlanGenerationError
from core.models import (
    Channel,
    Message,
    CampaignChannel,
    ChannelAdmin,
    MessagePreviewToken,
    UserLoginToken,
    LegalEntity,
    Payout,
    Campaign,
    MediaPlanGeneration,
)
from web_app.logger import logger
from core.metrics import (
    publication_requests_total,
    publication_requests_success,
    publication_requests_failed,
    publication_requests_no_creative,
    publication_request_duration_seconds,
    creative_selection_duration_seconds,
    bot_publication_attempts,
    bot_publication_duration_seconds,
    active_publication_requests,
)
import time
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
    CampaignSerializer,
    MediaPlanGenerationRequestSerializer,
    MediaPlanGenerationHistorySerializer,
)
from core.ledger_service import DoubleEntryLedgerService as BalanceService
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
        channel__is_deleted=False,
        campaign__is_archived=False,
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


class PublicationRequestViewSet(ModelViewSet):
    """
    CHANGE: Added ViewSet for handling publication requests from microservice
    WHY: Required by ТЗ 4.1.2 - accept requests, select creative, initiate publication
    QUOTE(ТЗ): "реализовать защищённый эндпоинт/очередь, принимающую запрос (канал, формат, параметры)"
    REF: issue #46
    """
    from core.models import PublicationRequest
    from core.serializers import PublicationRequestSerializer, PublicationResponseSerializer
    from core.authentication import MicroserviceBearerTokenAuthentication

    queryset = PublicationRequest.objects.all()
    serializer_class = PublicationRequestSerializer
    authentication_classes = [MicroserviceBearerTokenAuthentication]
    permission_classes = [AllowAny]  # Auth handled by authentication_classes

    @action(detail=False, methods=["POST"], url_path="request-publication")
    def request_publication(self, request, *args, **kwargs):
        """
        Принять запрос на публикацию от микросервиса.

        Логика:
        1. Валидировать входящий запрос
        2. Найти канал
        3. Выбрать подходящий креатив
        4. Создать публикацию
        5. Вернуть статус
        """
        from core.services import CreativeSelectionService
        from core.serializers import PublicationRequestSerializer, PublicationResponseSerializer, ChannelSerializer, MessageSerializer
        from core.models import PublicationRequest
        import requests
        from rest_framework.renderers import JSONRenderer

        # CHANGE: Added metrics tracking for monitoring
        # WHY: Required by ТЗ 4.1.3 - track request metrics
        # REF: issue #47
        start_time = time.time()
        active_publication_requests.inc()
        req_format = request.data.get("format", "unknown")

        try:
            # Валидация входящих данных
            serializer = PublicationRequestSerializer(data=request.data)
            if not serializer.is_valid():
                publication_requests_total.labels(status="validation_error", format=req_format).inc()
                publication_requests_failed.labels(error_type="validation_error", format=req_format).inc()
                duration = time.time() - start_time
                publication_request_duration_seconds.labels(status="validation_error", format=req_format).observe(duration)
                return Response(
                    {"status": "error", "message": "Неверные параметры запроса", "errors": serializer.errors},
                    status=status.HTTP_400_BAD_REQUEST
                )

            validated_data = serializer.validated_data
            channel_id = validated_data.get("channel_id")
            tg_id = validated_data.get("tg_id")
            format = validated_data["format"]
            parameters = validated_data.get("parameters", {})

            # Найти канал
            try:
                channel = serializer.validate_channel(channel_id=channel_id, tg_id=tg_id)
            except Exception as e:
                publication_requests_total.labels(status="channel_not_found", format=format).inc()
                publication_requests_failed.labels(error_type="channel_not_found", format=format).inc()

                pub_request = PublicationRequest.objects.create(
                    channel_id=channel_id if channel_id else None,
                    format=format,
                    status=PublicationRequest.Status.ERROR,
                    request_data=request.data,
                    error_message=str(e),
                )

                duration = time.time() - start_time
                publication_request_duration_seconds.labels(status="channel_not_found", format=format).observe(duration)

                return Response(
                    {
                        "status": "error",
                        "message": str(e),
                        "publication_request_id": str(pub_request.id)
                    },
                    status=status.HTTP_404_NOT_FOUND
                )

            # Создаём запись о запросе
            pub_request = PublicationRequest.objects.create(
                channel=channel,
                format=format,
                status=PublicationRequest.Status.PENDING,
                request_data=request.data,
            )

            publication_requests_total.labels(status="received", format=format).inc()

            # Выбираем подходящий креатив
            creative_start = time.time()
            campaign = CreativeSelectionService.select_creative(
                channel=channel,
                format=format,
                parameters=parameters
            )
            creative_duration = time.time() - creative_start
            creative_selection_duration_seconds.labels(format=format).observe(creative_duration)

            if not campaign:
                pub_request.status = PublicationRequest.Status.NO_CREATIVE
                pub_request.error_message = "Подходящий креатив не найден"
                pub_request.save()

                publication_requests_no_creative.labels(format=format).inc()
                publication_requests_total.labels(status="no_creative", format=format).inc()
                duration = time.time() - start_time
                publication_request_duration_seconds.labels(status="no_creative", format=format).observe(duration)

                return Response(
                    {
                        "status": "no_creative",
                        "message": "Подходящий креатив не найден для канала и формата",
                        "publication_request_id": str(pub_request.id),
                        "channel": ChannelSerializer(channel).data,
                    },
                    status=status.HTTP_404_NOT_FOUND
                )

            # Создаём публикацию
            campaign_channel = CreativeSelectionService.create_publication(
                channel=channel,
                campaign=campaign,
                parameters=parameters
            )

            pub_request.campaign_channel = campaign_channel
            pub_request.status = PublicationRequest.Status.SUCCESS
            pub_request.response_data = {
                "campaign_channel_id": str(campaign_channel.id),
                "campaign_id": str(campaign.id),
                "message_id": str(campaign.message.id),
            }
            pub_request.save()

            # Отправляем запрос на публикацию в бот
            bot_start = time.time()
            try:
                from core.serializers import CampaignChannelSerializer
                payload = CampaignChannelSerializer(campaign_channel).data
                data = JSONRenderer().render(payload)
                response = requests.post(
                    f"{app_settings.DOMAIN_URI}/telegram/public-campaign-channel",
                    data=data,
                    headers={"content-type": "application/json"},
                    timeout=30
                )
                bot_duration = time.time() - bot_start
                bot_publication_duration_seconds.observe(bot_duration)
                bot_publication_attempts.labels(status="success").inc()
                logger.info(f"Sent publication request to bot: {response.status_code}")
            except Exception as e:
                bot_publication_attempts.labels(status="error").inc()
                logger.error(f"Failed to send publication request to bot: {e}")

            # Track success metrics
            publication_requests_success.labels(format=format).inc()
            publication_requests_total.labels(status="success", format=format).inc()
            duration = time.time() - start_time
            publication_request_duration_seconds.labels(status="success", format=format).observe(duration)

            return Response(
                {
                    "status": "success",
                    "message": "Публикация создана успешно",
                    "publication_request_id": str(pub_request.id),
                    "campaign_channel_id": str(campaign_channel.id),
                    "channel": ChannelSerializer(channel).data,
                    "creative": MessageSerializer(campaign.message).data,
                },
                status=status.HTTP_201_CREATED
            )

        except Exception as e:
            pub_request.status = PublicationRequest.Status.ERROR
            pub_request.error_message = str(e)
            pub_request.save()

            publication_requests_failed.labels(error_type="processing_error", format=format).inc()
            publication_requests_total.labels(status="error", format=format).inc()
            duration = time.time() - start_time
            publication_request_duration_seconds.labels(status="error", format=format).observe(duration)

            logger.error(f"Error processing publication request: {e}", exc_info=True)

            return Response(
                {
                    "status": "error",
                    "message": f"Ошибка обработки запроса: {str(e)}",
                    "publication_request_id": str(pub_request.id),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        finally:
            active_publication_requests.dec()


class CampaignViewSet(ModelViewSet):
    """
    ViewSet for Campaign management and media plan generation.

    CHANGE: Added ViewSet for campaign operations
    WHY: Issue #48 requires endpoint for media plan generation
    REF: #48
    """
    queryset = Campaign.objects.filter(is_archived=False)
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post"]
    serializer_class = CampaignSerializer
    history_limit = 5

    def get_serializer_class(self):
        if getattr(self, "action", None) == "generate_media_plan":
            return MediaPlanGenerationRequestSerializer
        return super().get_serializer_class()

    def _build_history(self, request):
        history_qs = (
            MediaPlanGeneration.objects.filter(
                requested_by=request.user if request.user.is_authenticated else None
            )
            .prefetch_related("campaigns")
            .order_by("-created_at")[: self.history_limit]
        )
        serializer = MediaPlanGenerationHistorySerializer(
            history_qs,
            many=True,
            context={"request": request},
        )
        return serializer.data

    @action(detail=False, methods=["POST"], url_path="generate-media-plan")
    def generate_media_plan(self, request, *args, **kwargs):
        """
        Generate media plan for selected campaigns.

        CHANGE: Added endpoint for media plan generation
        WHY: Issue #48 requires API endpoint to receive selected campaigns
        REF: #48
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        campaign_ids = serializer.validated_data["campaign_ids"]

        campaigns = Campaign.objects.filter(id__in=campaign_ids, is_archived=False)
        if not campaigns.exists():
            return Response(
                {"status": "error", "message": "Кампании не найдены"},
                status=status.HTTP_404_NOT_FOUND,
            )

        found_ids = {str(campaign_id) for campaign_id in campaigns.values_list("id", flat=True)}
        requested_ids = {str(campaign_id) for campaign_id in campaign_ids}
        missing = requested_ids - found_ids

        generation = MediaPlanGeneration.objects.create(
            requested_by=request.user if request.user.is_authenticated else None,
        )
        generation.campaigns.set(campaigns)

        generator = MediaPlanGenerator()
        try:
            result = generator.generate(campaigns)
        except MediaPlanGenerationError as exc:
            generation.mark_error(str(exc))
            generation.save(update_fields=["status", "completed_at", "error_message", "updated_at"])
            logger.warning("Media plan generation failed: %s", exc)
            return Response(
                {"status": "error", "message": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:  # noqa: BLE001
            generation.mark_error("Внутренняя ошибка генерации")
            generation.error_message = str(exc)
            generation.save(update_fields=["status", "completed_at", "error_message", "updated_at"])
            logger.exception("Unexpected error while generating media plan")
            return Response(
                {
                    "status": "error",
                    "message": "Не удалось сформировать медиаплан. Попробуйте позже.",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        storage_name = f"media_plans/{generation.id}_{result.filename}"
        generation.file.save(storage_name, ContentFile(result.content), save=False)
        metadata = {
            "campaign_ids": list(found_ids),
            "campaign_names": list(campaigns.values_list("name", flat=True)),
            "totals": result.totals,
        }
        if missing:
            metadata["missing_campaign_ids"] = list(missing)
        generation.mark_success(len(result.rows), metadata=metadata)
        generation.save()

        history = self._build_history(request)
        download_url = history[0]["download_url"] if history else None

        logger.info(
            "Media plan generated for %s campaigns. record=%s",
            campaigns.count(),
            generation.id,
        )

        response_payload = {
            "status": "success",
            "message": f"Сформирован медиаплан для {campaigns.count()} кампаний",
            "generation_id": str(generation.id),
            "download_url": download_url,
            "totals": result.totals,
            "history": history,
        }
        if missing:
            response_payload["missing_campaign_ids"] = list(missing)

        return Response(response_payload, status=status.HTTP_200_OK)
