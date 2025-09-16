from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from django.db.models import QuerySet, F, Sum, OuterRef, Subquery


class CampaignQS(QuerySet):
    def active(self):
        """active campaigns"""
        from core.models import Campaign

        return self.filter(status=Campaign.Statuses.ACTIVE)

    def paused(self):
        from core.models import Campaign

        return self.filter(status=Campaign.Statuses.PAUSED)


class CampaignChannelQs(QuerySet):
    def active(self):
        return self.filter(campaign__status="active")

    def paused(self):
        return self.filter(campaign__status="paused")

    @property
    def campaigns_subqs(self):
        from core.models import Campaign

        campaigns_channels_qs = self.filter(
            campaign_id=OuterRef("pk"),
        )
        return Campaign.objects.filter(
            id=Subquery(campaigns_channels_qs.values("campaign_id")[:1])
        )

    def anon_campaign_statistics(self):
        return self.campaigns_subqs.annotate(
            all_budget_fact=Sum(
                F("campaigns_channel__cpm") * F("campaigns_channel__impressions_fact")
            ),
            all_budget_plan=Sum(
                F("campaigns_channel__cpm") * F("campaigns_channel__impressions_plan")
            ),
        ).values("id", "name", "budget", "all_budget_fact", "all_budget_plan", "status")

    def update_campaign_activity(self):
        from core.models import Campaign

        to_update = self.anon_campaign_statistics().filter(
            all_budget_fact__gte=F("budget"), status=Campaign.Statuses.ACTIVE
        )
        return Campaign.objects.filter(id__in=to_update.values("id")).update(
            status=Campaign.Statuses.PAUSED
        )

    def recent_published_messages_since(self, *, minutes: int):
        now = timezone.now().replace(microsecond=0)
        range_time = timezone.now() - timedelta(minutes=minutes)
        return self.active().filter(
            channel_post_id__isnull=False,
            publish_status="published",
            message_publish_date__range=(range_time, now),
        )

    def campaign_channels_total_budgets(self):
        return self.aggregate(
            total_budgets=Sum("impressions_plan") / Decimal(1000) * Sum("cpm")
        )["total_budgets"]

    def admin_channel_status_qs(self, channel_admin_id, channel_status) -> CampaignChannelQs:
        from core.models import ChannelAdmin
        channels = ChannelAdmin.objects.channels_by_status(channel_admin_id, channel_status)
        return self.filter(
            channel__in=channels,
            channel_admin_id=channel_admin_id,
        )
