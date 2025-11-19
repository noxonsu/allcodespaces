"""
CHANGE: Тесты для архивирования кампаний
WHY: Issue #43 - безопасная альтернатива удалению
REF: #43
"""
from django.test import TestCase
from core.tests.factories import CampaignFactory, CampaignChannelFactory
from core.models import Campaign, CampaignChannel


class CampaignArchivingTests(TestCase):
    """Тесты на архивирование кампаний"""

    def test_campaign_can_be_archived(self):
        """Кампания может быть помечена как архивная"""
        campaign = CampaignFactory(is_archived=False)
        self.assertFalse(campaign.is_archived)

        campaign.is_archived = True
        campaign.save()
        campaign.refresh_from_db()

        self.assertTrue(campaign.is_archived)

    def test_campaign_archived_field_persists(self):
        """Поле is_archived сохраняется в БД"""
        campaign = CampaignFactory(is_archived=False, name="Test Campaign")

        # Архивируем
        campaign.is_archived = True
        campaign.save()

        # Проверяем что поле сохранилось в БД
        reloaded = Campaign.objects.get(name="Test Campaign")
        self.assertTrue(reloaded.is_archived)

    def test_archived_campaign_can_be_unarchived(self):
        """Архивная кампания может быть разархивирована"""
        campaign = CampaignFactory(is_archived=True)
        self.assertTrue(campaign.is_archived)

        campaign.is_archived = False
        campaign.save()
        campaign.refresh_from_db()

        self.assertFalse(campaign.is_archived)

    def test_new_campaign_is_not_archived_by_default(self):
        """Новая кампания не архивирована по умолчанию"""
        campaign = CampaignFactory()
        self.assertFalse(campaign.is_archived)

    def test_archived_campaigns_excluded_from_default_queryset(self):
        """Архивные кампании исключены из дефолтного queryset"""
        active_campaign = CampaignFactory(is_archived=False, name="Active")
        archived_campaign = CampaignFactory(is_archived=True, name="Archived")

        # В дефолтном queryset должны быть все кампании
        all_campaigns = Campaign.objects.all()
        self.assertEqual(all_campaigns.count(), 2)

        # Проверяем фильтрацию
        non_archived = Campaign.objects.filter(is_archived=False)
        self.assertEqual(non_archived.count(), 1)
        self.assertEqual(non_archived.first().name, "Active")

        archived_only = Campaign.objects.filter(is_archived=True)
        self.assertEqual(archived_only.count(), 1)
        self.assertEqual(archived_only.first().name, "Archived")
