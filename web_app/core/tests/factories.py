from factory.django import DjangoModelFactory
import factory.random
from factory import SubFactory
from faker import Faker

from core.models import Channel, ChannelAdmin


faker = Faker()


class MessageFactory(DjangoModelFactory):
    class Meta:
        model = 'core.Message'

    header = factory.Faker('text')
    body = factory.Faker('text')
    footer = factory.Faker('text')


class CampaignFactory(DjangoModelFactory):
    class Meta:
        model = 'core.Campaign'
        django_get_or_create = ('name',)

    name = factory.Faker('name')
    status = factory.random.random.choice(['active', 'paused'])
    budget = factory.Faker('random_int')
    message = factory.SubFactory(MessageFactory)
    start_date = factory.Faker('date')
    finish_date = factory.Faker('date')


class ChannelFactory(DjangoModelFactory):
    class Meta:
        model = 'core.Channel'
        django_get_or_create = ('name',)
    name = factory.Faker('name')
    tg_id = factory.Faker('uuid4')
    is_bot_installed = factory.Faker('boolean')
    is_active = factory.Faker('boolean')


class CampaignChannelFactory(DjangoModelFactory):
    class Meta:
        model = 'core.CampaignChannel'
        django_get_or_create = ('channel', "campaign")

    campaign = factory.SubFactory(CampaignFactory)
    channel = factory.SubFactory(ChannelFactory)
    cpm = factory.Faker('random_int')
    impressions_plan = factory.Faker('random_int')
    impressions_fact = factory.Faker('random_int')
    is_message_published = factory.Faker('boolean')
    message_publish_date = factory.Faker('date')
    channel_post_id = factory.Faker('uuid4')
    campaign_active = factory.Faker('boolean')


class UserFactory(DjangoModelFactory):
    class Meta:
        model = 'core.User'
        django_get_or_create = ('username',)



class ChannelAdminFactory(DjangoModelFactory):
    class Meta:
        model = ChannelAdmin
        django_get_or_create = ('username',)

    username = faker.user_name()
    tg_id = faker.Faker('uuid4')
    first_name = faker.first_name()
    last_name = faker.last_name()
    phone_number = faker.phone_number()
    email = faker.free_email()
    inn = faker.Faker('text')
    legal_name = faker.Faker('text')
    cooperation_form = faker.Faker('text')
    role = faker.random.choice(['owner', 'manager'])
    channels = []
    is_bot_installed = factory.Faker('boolean')
    user = SubFactory(UserFactory)
