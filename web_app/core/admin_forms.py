from django import forms

from core.admin_utils import is_empty
from core.models import Campaign


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
