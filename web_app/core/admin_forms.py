from django import forms

from core.admin_utils import is_empty, is_not_valid_channel_status
from core.models import Campaign, Channel, ChannelAdmin


class ChannelForm(forms.ModelForm):
    def clean_status(self):
        status = self.cleaned_data.get('status')
        if 'status' in set(self.changed_data) and is_not_valid_channel_status(status, self.initial.get('status')):
                self.add_error('status', 'этот статус не может быть установлен, пожалуйста, выберите другой статус!')
        return status

    class Meta:
        model = Channel
        fields = '__all__'


class CampaignAdminForm(forms.ModelForm):
    def clean_client(self):
        is_new = self.instance and not self.instance.created_at and not self.instance.updated_at and self.instance._state.adding
        client_value = self.cleaned_data.get('client', '')
        if is_new and is_empty(client_value):
            self.add_error('client', 'это обязательное поле')
        return client_value

    class Meta:
        model = Campaign
        fields = '__all__'


class ChannelAdminForm(forms.ModelForm):
    channels = forms.ModelMultipleChoiceField(
        queryset=Channel.objects.all(),
        widget=forms.SelectMultiple(attrs={'class': 'form-control wide'}),
        required=False
    )

    class Meta:
        model = ChannelAdmin
        fields = '__all__'
