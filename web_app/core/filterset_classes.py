
from django_filters.filterset import FilterSet
from django_filters import rest_framework as filters

from core.models import CampaignChannel, Campaign
from django.db.models import QuerySet, Q


class CampaignChannelFilterSet(FilterSet):
    channel_tg_id = filters.CharFilter(field_name='channel__tg_id')
    words = filters.CharFilter(method='filter_words')
    is_message_published = filters.BooleanFilter(method='filter_is_message_published')

    def filter_is_message_published(self, queryset, name, value):
        print(f'{value=}')
        print(f'{type(value)=}')
        if value is True:
            return queryset.filter(publish_status=CampaignChannel.PublishStatusChoices.PUBLISHED)
        return queryset.filter(~Q(publish_status=CampaignChannel.PublishStatusChoices.PUBLISHED))

    def filter_words(self, queryset, name, words_seperated: str) -> QuerySet[CampaignChannel]:
        def _in(words_list: set[str], filter_set: set[str]) -> bool:
            print(f'{words_list=}')
            print(f'{filter_set=}')
            for word in words_list:
                print(f'{word=}')
                if word in filter_set:
                    return True
            return False

        words_set: set[str] = set(map(lambda x:x.lower(), filter(lambda x: x is not None and len(x) > 0, words_seperated.split(','))))
        results: list[CampaignChannel] = []
        for campaign_channel in queryset.all():
            bad_set: set[str]  =  set(map(lambda x:x.lower().strip(), campaign_channel.campaign.black_list))
            white_set: set[str] = set(map(lambda x:x.lower().strip(), campaign_channel.campaign.white_list))
            print(f'{bad_set=}')
            print(f'{white_set=}')

            if not getattr(campaign_channel, 'campaign', None):
                continue

            if not getattr(campaign_channel, 'channel_admin', None):
                continue

            if getattr(campaign_channel, 'campaign', None) and campaign_channel.campaign.status == Campaign.Statuses.PAUSED:
                continue

            if campaign_channel.is_approved and (not white_set and not bad_set) or campaign_channel.is_approved and not words_set:
                results.append(campaign_channel.id)

            elif campaign_channel.is_approved and not _in(words_set, bad_set) and _in(words_set, white_set):
                results.append(campaign_channel.id)

        return queryset.filter(id__in=results)


    class Meta:
        model = CampaignChannel
        fields = [
            'channel_tg_id',
            'channel',
            'campaign',
            'cpm',
            'is_message_published',
            'words',
            'publish_status',
    ]