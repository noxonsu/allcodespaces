import re

from django import template
# from django.contrib.admin.templatetags.admin_list import result_list
# from django.contrib.admin.templatetags.base import InclusionAdminNode
# from django.contrib.admin.views.main import ChangeList
from django.utils.safestring import mark_safe

from core.models import ChannelAdmin

register = template.Library()


# def result_list_custom(cl):
#     """
#     Display the headers and data list together.
#     """
#     data = result_list(cl)
#     return data
#
# # @register.simple_tag(takes_context=True)
# @register.simple_tag()
# def custom_result_list(parser, token):
#     return InclusionAdminNode(
#         parser,
#         token,
#         func=result_list_custom,
#         template_name="change_list_results.html",
#         takes_context=False,
#     )


@register.simple_tag()
def custom_result_list_totals(*args, **kwargs):
    result = kwargs['result']
    cl = kwargs['cl']
    totals = {
        'impressions_plan':0,
        'impressions_fact': 0,
        'clicks':0,
        'earned_money':0,
        'ctr':0
    }
    if cl and cl.result_list:
        for row in cl.result_list:
            totals['impressions_plan']+= row.impressions_plan if row.impressions_plan else 0
            totals['impressions_fact']+= row.impressions_fact if row.impressions_fact else 0
            totals['clicks']+=row.clicks if row.clicks else 0
            totals['ctr']+= row.clicks / row.impressions_fact * 100 if row.impressions_fact != 0 else 0
            totals['earned_money']+= row.earned_money if row.earned_money else 0
        totals['ctr']=f"{totals['ctr']:.2f}%" if totals['ctr'] else '0'

    html_str = ''
    p = r'<(?P<tg_nme>td|th) (?P<class_name>class=".*?")>(.+)(?P<tg_close><\/.*>)'
    len_result = len(result)
    for i_ in range(1, len_result):
        item = result[i_]
        match = re.search(p, item)
        if match is not None:
            tg, class_name, close_tg = match.groupdict().values()
            col_name = re.sub(r'field\-|_col|class|=|_link|"', '', class_name)
            value = totals.get(col_name, '-')
            row = '<td {class_name}><b style="color:#343a40; font-size:1.2rem">{value}</b></td>'.format(class_name=class_name, value=value)
        else:
            row = ''
        html_str+=row

    return mark_safe(html_str)


@register.simple_tag()
def channeladmin_read_only(*args, **kwargs):
    field = kwargs['field']
    context = kwargs['context']
    channeladmin = context.original.channeladmin
    read_only = not channeladmin.role == ChannelAdmin.Role.OWNER
    if read_only:
        return mark_safe(f'<span>{channeladmin}</a>')
    return field.contents()

@register.simple_tag()
def hide_delete_box(*args, **kwargs):
    field = kwargs['field']
    if field and field.form and field.form.instance and field.form.instance.is_approved:
        form = field.form
        DELETE_field = form['DELETE']
        DELETE_field.field.disabled = True
    return field.contents()

