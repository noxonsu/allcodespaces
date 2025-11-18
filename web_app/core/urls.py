from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ChannelViewSet,
    MessageViewSet,
    CampaignChannelViewSet,
    TGLoginView,
    ChannelAdminViewSet,
    LegalEntityViewSet,
    PayoutViewSet,
    AboutView,
)

app_name = "core"

channel_router = DefaultRouter()
message_router = DefaultRouter()
campaign_channel = DefaultRouter()
channel_admin = DefaultRouter()
legal_entity_router = DefaultRouter()
payout_router = DefaultRouter()


channel_router.register("", ChannelViewSet)
message_router.register("", MessageViewSet)
campaign_channel.register("", CampaignChannelViewSet)
channel_admin.register("", ChannelAdminViewSet)
legal_entity_router.register("", LegalEntityViewSet)
payout_router.register("", PayoutViewSet)


api_urls = [
    path("channel/", include(channel_router.urls)),
    path("message/", include(message_router.urls)),
    path("campaign-channel/", include(campaign_channel.urls)),
    path("channel-admin/", include(channel_admin.urls)),
    path("legal-entity/", include(legal_entity_router.urls)),
    path("payout/", include(payout_router.urls)),
]

urlpatterns = [
    path("about", AboutView.as_view()),
    path("login/tg", TGLoginView.as_view()),
    path("", include(api_urls)),
]
