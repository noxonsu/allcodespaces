import re

from django import template
from django.db.models import Sum, F, Q, Avg

from django.utils.safestring import mark_safe

from core.models import ChannelAdmin

register = template.Library()




@register.simple_tag()
def custom_result_list_totals(*args, **kwargs):
    result = kwargs["result"]
    cl = kwargs["cl"]
    totals = {
        "impressions_plan": 0,
        "impressions_fact": 0,
        "clicks": 0,
        "earned_money": 0,
        "ctr": 0,
    }
    if cl and cl.result_list:
        for row in cl.result_list:
            totals["impressions_plan"] += (
                row.impressions_plan if row.impressions_plan else 0
            )
            totals["impressions_fact"] += (
                row.impressions_fact if row.impressions_fact else 0
            )
            totals["clicks"] += row.clicks if row.clicks else 0
            totals["ctr"] += (
                row.clicks / row.impressions_fact * 100
                if row.impressions_fact != 0
                else 0
            )
            totals["earned_money"] += row.earned_money if row.earned_money else 0
        totals["ctr"] = f"{totals['ctr']:.2f}%" if totals["ctr"] else "0"

    html_str = ""
    p = r'<(?P<tg_nme>td|th) (?P<class_name>class=".*?")>(.+)(?P<tg_close><\/.*>)'
    len_result = len(result)
    for i_ in range(1, len_result):
        item = result[i_]
        match = re.search(p, item)
        if match is not None:
            tg, class_name, close_tg = match.groupdict().values()
            col_name = re.sub(r'field\-|_col|class|=|_link|"', "", class_name)
            value = totals.get(col_name, "-")
            row = '<td {class_name}><b style="color:#343a40; font-size:1.2rem">{value}</b></td>'.format(
                class_name=class_name, value=value
            )
        else:
            row = ""
        html_str += row

    return mark_safe(html_str)


@register.simple_tag()
def channeladmin_read_only(*args, **kwargs):
    field = kwargs["field"]
    context = kwargs["context"]
    field_name = field.field.get("name")
    channeladmin = context.original.channeladmin
    read_only = not channeladmin.role == ChannelAdmin.Role.OWNER
    if read_only and field_name == "channeladmin":
        return mark_safe(f"<span>{channeladmin}</span>")
    if field.is_readonly and field_name == "chat_room":
        return mark_safe(
            f'<a class="btn btn-info" target="_blank" href="{channeladmin.chat}">&#128172;</a>'
        )
    return field.contents()


@register.simple_tag()
def hide_delete_box(*args, **kwargs):
    field = kwargs["field"]
    if (
        field
        and field.form
        and field.form.instance
        and field.form.instance.is_message_published
    ):
        form = field.form
        DELETE_field = form["DELETE"]
        DELETE_field.field.disabled = True
    return field.contents()


# use escape  html to not xss attacks
@register.simple_tag(takes_context=True)
def campaign_channels_totals_bar(context, *args, **kwargs):
    """simply passing datas to javascript by data- attr"""

    formset = kwargs['form'].formset
    totals = formset.queryset.aggregate(
        total_clicks=Sum("clicks",default=0),
        total_impressions_fact=Sum("impressions_fact",default=0),
        total_budget=Sum(F("cpm") * F('impressions_fact') / 1000, filter=Q(cpm__gte=1 , impressions_fact__gte=1), default=0),
        total_impressions_plan=Sum("impressions_plan", default=0),
        total_ctr=Sum(F('clicks') / F("impressions_fact") * 100, filter=Q(clicks__gte=1, impressions_fact__gte=1), default=0),
        total_cpm = Sum('cpm'),
        total_plan_cpm=Sum('total_plan_cpm'),
        avg_cpm=Avg("cpm", default=0, filter=Q(cpm__gte=1)),
        avg_cpm_plan=Avg("plan_cpm", default=0, filter=Q(plan_cpm__gte=1)),
        )
    total_clicks, total_impressions_fact, total_budget, total_impressions_plan, total_ctr,total_cpm, total_plan_cpm, avg_cpm, avg_cpm_plan = totals.values()
    total_cpm_diff = (1- total_plan_cpm / total_cpm) * 100 *-1 if total_plan_cpm and total_cpm else 0
    hidden_tags = f"""
        <div id='campaign_channels_totals'> 
            <label data-totals-clicks={total_clicks}></label>
            <label data-totals-impressions-fact={total_impressions_fact}></label>
            <label data-totals-budget={total_budget:.2f}></label>
            <label data-totals-impressions-plan={total_impressions_plan}></label>
            <label data-totals-ctr={round(total_ctr,2) if total_ctr else '-'}></label>
            <label data-totals-cpm-diff={total_cpm_diff:.2f}></label>
            <label data-totals-avg-cpm={avg_cpm:.2f}></label>
            <label data-totals-avg-cpm-plan={avg_cpm_plan:.2f}></label>
        </div>
    """
    return mark_safe(hidden_tags)
