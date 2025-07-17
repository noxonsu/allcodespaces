# from django.test import TestCase
#
# from core.external_clients import TGStatClient
# from core.factories import CampaignFactory
# from core.factories.common import CampaignChannelFactory
# from core.models import Campaign, CampaignChannel
#
#
# class TestCampaignIntegrationTests(TestCase):
#
#     def test_get_active_campaigns_success(self):
#         CampaignFactory.create_batch(5, status='active')
#         CampaignFactory.create_batch(10, status='paused')
#
#         self.assertEqual(Campaign.objects.active().count(), 5)
#         self.assertEqual(Campaign.objects.paused().count(), 10)
#         self.assertEqual(Campaign.objects.all().count(), 15)
#
#     def test_cls_campaign_alter_activity(self):
#         aa = CampaignChannelFactory(cpm=1000, impressions_fact=1000, campaign__budget=500, campaign__name='A', campaign__status='active')
#         CampaignChannelFactory(cpm=200, impressions_fact=2000, campaign=aa.campaign, campaign__budget=50)
#         CampaignChannelFactory(cpm=20, impressions_fact=200, campaign__budget=300, campaign__name='B', campaign__status='active')
#         CampaignChannelFactory(cpm=30, impressions_fact=20, campaign__budget=30000, campaign__name='C', campaign__status='active')
#         updated_count = CampaignChannel.cls_alter_campaign_activity()
#         self.assertEqual(updated_count, 2)
#
#
# class TestTGStatTests(TestCase):
#     def setUp(self):
#         self.client = TGStatClient()
#
#     def test_get_message_state(self):
#         post_id = 162
#         response = self.client.update_message_views(post_id=post_id)
#         """
#         Response
#         {'status': 'ok',
#         'response': {'id': 162, 'date': 1493998201, 'views': 3820,
#         'link': 't.me/nplusone/4127',
#         'channel_id': 15, 'forwarded_from': None,
#         'is_deleted': 0, 'deleted_at': None,
#         'group_id': None,
#         'text': 'Физики из США смоделировали новую протонную мембрану для водородных топливных элементов. В отличие от популярных современных аналогов, для ее функционирования не нужна вода, а значит такая мембрана может работать при температурах до 200 градусов Цельсия. Высокая температура увеличивает скорость химических реакций и, как следствие, мощность элемента. Из чего сделана такая мембрана? Из графана, естественно! \nПодробнее на N + 1',
#         'media': {'type': 'webpage',
#         'title': 'Водородным элементам придумали «протонопровод» из графана',
#         'url': 'https://nplus1.ru/news/2017/05/05/graphane-membrane',
#         'file_size': None, 'file_url': None, 'file_thumbnail_url': None}
#         }}
#         """
#         self.assertEqual(response.status_code, 200)
