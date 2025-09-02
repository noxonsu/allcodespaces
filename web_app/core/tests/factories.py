from factory.django import DjangoModelFactory
import factory.random
from factory import SubFactory
from faker import Faker

from core.models import Channel, ChannelAdmin


faker = Faker()


class MessageFactory(DjangoModelFactory):
    class Meta:
        model = 'core.Message'

    name = factory.Faker('text')
    body = factory.Faker('text')
    title = factory.Faker('text')
    is_external = factory.Faker('boolean')
    button_str = factory.Faker('text')
    button_link = factory.Faker('url')


class CampaignFactory(DjangoModelFactory):
    class Meta:
        model = 'core.Campaign'
        django_get_or_create = ('name',)

    name = factory.Faker('name')
    status = factory.random.random.choice(['active', 'paused'])
    budget = factory.Faker('random_int', min=1, max=10000)
    message = factory.SubFactory(MessageFactory)
    start_date = faker.date_between(start_date='now', end_date='now')
    finish_date = faker.date_between(start_date='now', end_date='now')
    white_list = factory.lazy_attribute(lambda x: list())
    black_list = factory.lazy_attribute(lambda x: list())
    inn_advertiser = factory.Faker('random_int', min=1, max=10000)
    token_ord = factory.Faker('text')
    client = factory.Faker('name')
    brand = factory.Faker('name')


class ChannelFactory(DjangoModelFactory):
    class Meta:
        model = 'core.Channel'
        django_get_or_create = ('name',)
    name = factory.Faker('name')
    tg_id = factory.Faker('random_int')
    is_bot_installed = factory.Faker('boolean')
    about = factory.Faker('text')
    language = factory.Faker('name')
    category = factory.Faker('name')
    username = factory.Faker('name')
    invitation_link = factory.Faker('url')
    avatar_url=factory.Faker('url')
    posts_count = factory.Faker('pyint', min_value=1)
    members_count = factory.Faker('random_int', min=1, max=100)
    avg_posts_reach = factory.Faker('pyfloat', min_value=1)
    er = factory.Faker('pyfloat', min_value=1)
    err = factory.Faker('pyfloat', min_value=1)
    err_24 = factory.Faker('pyfloat', min_value=1)
    daily_reach = factory.Faker('pyfloat', min_value=1)


class UserFactory(DjangoModelFactory):
    class Meta:
        model = 'core.User'
    username = factory.Faker('name')


class ChannelAdminFactory(DjangoModelFactory):
    class Meta:
        model = ChannelAdmin
        django_get_or_create = ('username',)

    username = faker.user_name()
    tg_id = faker.random_int()
    first_name = faker.first_name()
    last_name = faker.last_name()
    phone_number = faker.phone_number()
    email = faker.free_email()
    inn = faker.random_int(min=1, max=10000)
    cooperation_form = faker.random.choice([i[0] for i in ChannelAdmin.CooperationFormChoices.choices])
    legal_name = faker.text()
    role = faker.random.choice([i[0] for i in ChannelAdmin.Role.choices])
    is_bot_installed = factory.Faker('boolean')
    user = SubFactory(UserFactory)


class CampaignChannelFactory(DjangoModelFactory):
    class Meta:
        model = 'core.CampaignChannel'
        django_get_or_create = ('channel', "campaign")

    campaign = factory.SubFactory(CampaignFactory)
    channel = factory.SubFactory(ChannelFactory)
    channel_admin = factory.SubFactory(ChannelAdminFactory)
    cpm = factory.Faker('random_int', min=1, max=10000)
    impressions_plan = factory.Faker('random_int', min=1, max=10000)
    impressions_fact = factory.Faker('random_int', min=1, max=10000)
    is_message_published = factory.Faker('boolean')
    message_publish_date = factory.Faker('date')
    channel_post_id = factory.Faker('random_int', min=1, max=10000)
    clicks = factory.Faker('random_int', min=1, max=10000)
    is_approved = factory.Faker('boolean')
