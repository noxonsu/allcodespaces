from decimal import Decimal

def get_property_attr(col, model, attr_name):
    return getattr(getattr(model, col).fget, attr_name)


def budget_cpm(impressions_plan=None, cpm=None):
    return( Decimal(Decimal(impressions_plan / 1000) * cpm).quantize(Decimal('0.01'))
            if cpm and impressions_plan
            else 0
        )

def budget_cpm_from_qs(qs: "QuerySet[CampaignChannel]"):
   total = 0
   for row in qs:
       print(f'{row=}')
       if row.campaign and row.channel:
           print(f'DOG{row=}')
           total += budget_cpm(cpm=row.cpm, impressions_plan=row.impressions_plan)
   return total
