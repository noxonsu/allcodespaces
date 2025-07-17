from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _



def campaign_budget_validator(instance: "Campaign") -> None:
    """raise error if the channels budget more than campaign"""
    ...
    # sum_budget_fact = sum(map(lambda channel: channel.budget_fact, instance.channels.all()))
    # if instance.budget and instance.budget < sum_budget_fact:
    #     raise ValidationError(_("the channels budget cannot be higher than the campaign budget"))


def campaign_channel_can_added(instance: "CampaignChannel") -> None:
    campaign = getattr(instance, 'campaign', None)
    channel = getattr(instance, 'channel', None)
    if campaign and channel and not channel.is_active:
        raise ValidationError({"channel": _("only channel with is_active can be added to campaign")})

