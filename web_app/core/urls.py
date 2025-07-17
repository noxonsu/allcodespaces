from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ChannelViewSet, MessageViewSet, CampaignChannelViewSet, TGLoginView, ChannelAdminViewSet

app_name = 'core'

channel_router = DefaultRouter()
message_router = DefaultRouter()
campaign_channel = DefaultRouter()
channel_admin = DefaultRouter()


channel_router.register('', ChannelViewSet)
message_router.register('', MessageViewSet)
campaign_channel.register('', CampaignChannelViewSet)
channel_admin.register('', ChannelAdminViewSet)


api_urls = [
    path('channel/', include(channel_router.urls)),
    path('message/', include(message_router.urls)),
    path('campaign-channel/', include(campaign_channel.urls)),
    path('channel-admin/', include(channel_admin.urls)),
]

urlpatterns = [
    path('login/tg', TGLoginView.as_view()),
    path('', include(api_urls)),
]