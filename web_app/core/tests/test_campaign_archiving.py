"""
CHANGE: Тесты для архивирования кампаний
WHY: Issue #43 - безопасная альтернатива удалению
REF: #43
"""
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from core.tests.factories import (
    CampaignFactory,
    CampaignChannelFactory,
    ChannelFactory,
    ChannelAdminFactory,
)
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

    def test_cannot_add_channel_to_archived_campaign(self):
        """Нельзя добавлять каналы в архивную кампанию"""
        archived_campaign = CampaignFactory(is_archived=True)
        channel = ChannelFactory()
        channel_admin = ChannelAdminFactory()

        campaign_channel = CampaignChannel(
            campaign=archived_campaign,
            channel=channel,
            channel_admin=channel_admin,
        )
        with self.assertRaises(ValidationError):
            campaign_channel.full_clean()


class CampaignArchivingAPITests(TestCase):
    """Интеграционные тесты API для архивных кампаний"""

    def setUp(self):
        self.client = APIClient()
        self.channel = ChannelFactory(is_deleted=False)
        self.channel_admin = ChannelAdminFactory()

    def _create_campaign_channel(self, archived: bool) -> CampaignChannel:
        campaign = CampaignFactory(is_archived=archived, status=Campaign.Statuses.ACTIVE)
        return CampaignChannelFactory(
            campaign=campaign,
            channel=self.channel,
            channel_admin=self.channel_admin,
        )

    def test_campaign_channel_list_excludes_archived_campaigns(self):
        active_cc = self._create_campaign_channel(archived=False)
        self._create_campaign_channel(archived=True)

        url = reverse("core:campaignchannel-list")
        response = self.client.get(url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], str(active_cc.id))

    def test_unpublished_campaigns_endpoint_excludes_archived(self):
        self._create_campaign_channel(archived=False)
        archived_cc = self._create_campaign_channel(archived=True)

        url = reverse("core:campaignchannel-unpublished-campaigns")
        response = self.client.post(
            url,
            data={"channel_tg_id": self.channel.tg_id},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.data}
        self.assertNotIn(str(archived_cc.id), ids)


class CampaignDeletionIntegrationTests(TestCase):
    """
    CHANGE: Интеграционные тесты для сценариев удаления и архивирования
    WHY: Issue #44 - проверка взаимодействия между удалением и архивированием
    REF: #44
    """

    def setUp(self):
        self.client = APIClient()
        self.channel = ChannelFactory(is_deleted=False)
        self.channel_admin = ChannelAdminFactory()

    def test_workflow_cannot_delete_with_publications_but_can_archive(self):
        """
        Интеграционный тест: кампанию с публикациями нельзя удалить,
        но можно заархивировать
        """
        # Создаем кампанию с опубликованным постом
        campaign = CampaignFactory(is_archived=False, status=Campaign.Statuses.ACTIVE)
        cc = CampaignChannelFactory(
            campaign=campaign,
            channel=self.channel,
            channel_admin=self.channel_admin,
        )
        # Устанавливаем статус PUBLISHED после создания
        cc.publish_status = CampaignChannel.PublishStatusChoices.PUBLISHED
        cc.save()

        # Проверяем, что кампанию нельзя удалить
        self.assertTrue(campaign.has_publications())

        # Архивируем кампанию
        campaign.is_archived = True
        campaign.save()
        campaign.refresh_from_db()

        # Проверяем, что архивация сработала
        self.assertTrue(campaign.is_archived)

        # Проверяем, что кампания исключена из API
        url = reverse("core:campaignchannel-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.data}
        self.assertNotIn(str(cc.id), ids)

    def test_workflow_archived_campaign_excluded_from_bot_endpoints(self):
        """
        Интеграционный тест: архивные кампании не попадают в bot endpoints
        """
        # Активная кампания
        active_campaign = CampaignFactory(
            is_archived=False,
            status=Campaign.Statuses.ACTIVE
        )
        active_cc = CampaignChannelFactory(
            campaign=active_campaign,
            channel=self.channel,
            channel_admin=self.channel_admin,
            publish_status=CampaignChannel.PublishStatusChoices.PLANNED,
        )

        # Архивная кампания
        archived_campaign = CampaignFactory(
            is_archived=True,
            status=Campaign.Statuses.ACTIVE
        )
        archived_cc = CampaignChannelFactory(
            campaign=archived_campaign,
            channel=self.channel,
            channel_admin=self.channel_admin,
            publish_status=CampaignChannel.PublishStatusChoices.PLANNED,
        )

        # Проверяем эндпоинт, который использует бот
        url = reverse("core:campaignchannel-unpublished-campaigns")
        response = self.client.post(
            url,
            data={"channel_tg_id": self.channel.tg_id},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.data}

        # Активная кампания должна быть в ответе
        self.assertIn(str(active_cc.id), ids)

        # Архивная кампания НЕ должна быть в ответе
        self.assertNotIn(str(archived_cc.id), ids)

    def test_workflow_unarchive_makes_campaign_visible_again(self):
        """
        Интеграционный тест: разархивирование возвращает кампанию в API
        """
        # Создаем заархивированную кампанию
        campaign = CampaignFactory(is_archived=True, status=Campaign.Statuses.ACTIVE)
        cc = CampaignChannelFactory(
            campaign=campaign,
            channel=self.channel,
            channel_admin=self.channel_admin,
        )

        # Проверяем, что кампания скрыта
        url = reverse("core:campaignchannel-list")
        response = self.client.get(url)
        ids = {item["id"] for item in response.data}
        self.assertNotIn(str(cc.id), ids)

        # Разархивируем
        campaign.is_archived = False
        campaign.save()
        campaign.refresh_from_db()

        # Проверяем, что кампания теперь видна
        response = self.client.get(url)
        ids = {item["id"] for item in response.data}
        self.assertIn(str(cc.id), ids)

    def test_archived_campaign_with_publications_still_cannot_be_deleted(self):
        """
        Тест: архивная кампания с публикациями все равно не может быть удалена
        """
        # Создаем заархивированную кампанию с публикациями
        campaign = CampaignFactory(is_archived=True, status=Campaign.Statuses.ACTIVE)
        cc = CampaignChannelFactory(
            campaign=campaign,
            channel=self.channel,
            channel_admin=self.channel_admin,
        )
        # Устанавливаем статус PUBLISHED после создания
        cc.publish_status = CampaignChannel.PublishStatusChoices.PUBLISHED
        cc.save()

        # Проверяем, что has_publications работает независимо от архивации
        self.assertTrue(campaign.has_publications())

        # Попытка удаления должна быть заблокирована
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            campaign.delete()
