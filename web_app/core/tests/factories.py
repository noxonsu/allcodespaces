import  factory.fuzzy
import factory.random

from factory.django import DjangoModelFactory
import factory.random
from faker import Faker

from core.models import Campaign, ChannelAdmin, Channel, PlacementFormat, default_supported_formats, ChannelPublicationSlot, ChannelTransaction, MediaPlanGeneration

faker = Faker()


class MessageFactory(DjangoModelFactory):
    class Meta:
        model = "core.Message"

    name = factory.Faker("text")
    body = factory.Faker("text")
    title = factory.Faker("text")
    is_external = factory.Faker("boolean")
    buttons = factory.List(
        [
            factory.Dict({"text": "Подробнее", "url": "https://example.com"}),
        ]
    )
    format = PlacementFormat.FIXED_SLOT


class CampaignFactory(DjangoModelFactory):
    class Meta:
        model = "core.Campaign"
        django_get_or_create = ("name",)

    name = factory.Faker("name")
    status = Campaign.Statuses.DRAFT
    budget = factory.Faker("random_int", min=1, max=10000)
    message = factory.SubFactory(MessageFactory)
    start_date = faker.date_between(start_date="now", end_date="now")
    finish_date = faker.date_between(start_date="now", end_date="now")
    white_list = factory.lazy_attribute(lambda x: list())
    black_list = factory.lazy_attribute(lambda x: list())
    inn_advertiser = factory.Faker("random_int", min=1, max=10000)
    token_ord = factory.Faker("text")
    client = factory.Faker("name")
    brand = factory.Faker("name")
    format = PlacementFormat.FIXED_SLOT
    slot_publication_at = factory.Faker("date_time")


class ChannelFactory(DjangoModelFactory):
    class Meta:
        model = "core.Channel"
        django_get_or_create = ("name",)

    name = factory.Faker("name")
    tg_id = factory.Faker("random_int")
    is_bot_installed = factory.Faker("boolean")
    about = factory.Faker("text")
    language = factory.Faker("name")
    category = factory.Faker("name")
    username = factory.Faker("name")
    invitation_link = factory.Faker("url")
    avatar_url = factory.Faker("url")
    posts_count = factory.Faker("pyint", min_value=1)
    members_count = factory.Faker("random_int", min=1, max=100)
    avg_posts_reach = factory.Faker("pyfloat", min_value=1)
    er = factory.Faker("pyfloat", min_value=1)
    err = factory.Faker("pyfloat", min_value=1)
    err_24 = factory.Faker("pyfloat", min_value=1)
    daily_reach = factory.Faker("pyfloat", min_value=1)
    is_deleted = False
    supported_formats = factory.LazyFunction(default_supported_formats)
    auto_approve_publications = False
    autopilot_min_interval = 60


class GroupFactory(DjangoModelFactory):
    class Meta:
        model = "auth.Group"
        django_get_or_create = ('name',)

    name = factory.fuzzy.FuzzyChoice(ChannelAdmin.Role.choices, getter=lambda x: x[0])

class UserFactory(DjangoModelFactory):
    class Meta:
        model = "core.User"

    username = factory.Faker("user_name")
    password = factory.django.Password('psswd')
    first_name = factory.Sequence(lambda n: 'first_name %03d' % n)
    last_name = factory.Sequence(lambda n: 'last_name %03d' % n)


    @factory.post_generation
    def groups(self, create, extracted, **kwargs):
        if not create or not extracted:
            # Simple build, or nothing to add, do nothing.
            return

        group = GroupFactory(name=ChannelAdmin.Role(extracted)) # using get_or_create for get or create a group
        self.groups.add(group)


class ChannelAdminFactory(DjangoModelFactory):
    class Meta:
        model = ChannelAdmin
        django_get_or_create = ("username",)

    username = faker.user_name()
    tg_id = faker.random_int()
    first_name = faker.first_name()
    last_name = faker.last_name()
    phone_number = faker.phone_number()
    email = faker.free_email()
    inn = faker.random_int(min=1, max=10000)
    cooperation_form = faker.random.choice(
        [i[0] for i in ChannelAdmin.CooperationFormChoices.choices]
    )
    legal_name = faker.text()
    role = factory.fuzzy.FuzzyChoice(ChannelAdmin.Role.choices, getter=lambda x: x[0])
    is_bot_installed = factory.Faker("boolean")
    # user = factory.RelatedFactory( # the user is created by django signals!!!


class LegalEntityFactory(DjangoModelFactory):
    class Meta:
        model = "core.LegalEntity"

    name = faker.company()
    short_name = faker.company_suffix()
    inn = faker.numerify(text="##########")
    kpp = faker.numerify(text="#########")
    ogrn = faker.numerify(text="#############")
    legal_address = faker.address()
    bank_name = faker.company()
    bank_bik = faker.numerify(text="#########")
    bank_correspondent_account = faker.numerify(text="##################")
    bank_account = faker.numerify(text="####################")
    contact_person = faker.name()
    contact_phone = faker.phone_number()
    contact_email = faker.email()
    #     'core.tests.factories.UserFactory',
    #     groups=factory.SelfAttribute('..profile.role')
    # )

    @factory.post_generation
    def channels(self, created, extracted, **kwargs):
        if not created or not extracted:
            return
        size = extracted.get('size', 1)
        status = extracted.get('status', Channel.ChannelStatus.PENDING)
        channels = ChannelFactory.create_batch(size=size, status=status)
        self.channels.set(channels)


class CampaignChannelFactory(DjangoModelFactory):
    class Meta:
        model = "core.CampaignChannel"
        django_get_or_create = ("channel", "campaign")

    campaign = factory.SubFactory(CampaignFactory)
    channel = factory.SubFactory(ChannelFactory)
    channel_admin = factory.SubFactory(ChannelAdminFactory)
    cpm = factory.Faker("random_int", min=1, max=10000)
    impressions_plan = factory.Faker("random_int", min=1, max=10000)
    impressions_fact = factory.Faker("random_int", min=1, max=10000)
    is_message_published = factory.Faker("boolean")
    message_publish_date = factory.Faker("date")
    channel_post_id = factory.Faker("random_int", min=1, max=10000)
    clicks = factory.Faker("random_int", min=1, max=10000)
    is_approved = factory.Faker("boolean")
    approval_notified_at = None
    publication_slot = None


class ChannelPublicationSlotFactory(DjangoModelFactory):
    class Meta:
        model = ChannelPublicationSlot

    channel = factory.SubFactory(ChannelFactory)
    weekday = factory.Iterator(range(7))
    start_time = factory.Faker("time_object")

    @factory.lazy_attribute
    def end_time(self):
        from datetime import datetime, timedelta

        start_dt = datetime.combine(datetime.today(), self.start_time)
        end_dt = start_dt + timedelta(minutes=30)
        return end_dt.time()


class ChannelTransactionFactory(DjangoModelFactory):
    """
    CHANGE: Refactored for Event Sourcing - removed status field
    WHY: Event Sourcing approach - transactions are append-only, no statuses
    QUOTE(ТЗ): "Event Sourcing - баланс = SUM(transactions). Нет race — только append"
    REF: issue #22 (refactoring)
    """
    class Meta:
        model = ChannelTransaction

    channel = factory.SubFactory(ChannelFactory)
    transaction_type = factory.Iterator(
        [choice[0] for choice in ChannelTransaction.TransactionType.choices]
    )
    amount = factory.Faker("pydecimal", left_digits=5, right_digits=2, positive=True)
    currency = "RUB"
    source_type = "manual"
    description = factory.Faker("sentence")

    @factory.lazy_attribute
    def amount(self):
        from decimal import Decimal
        import random
        # Положительные операции (INCOME, REFUND, UNFREEZE)
        if self.transaction_type in [
            ChannelTransaction.TransactionType.INCOME,
            ChannelTransaction.TransactionType.REFUND,
            ChannelTransaction.TransactionType.UNFREEZE,
        ]:
            return Decimal(str(random.uniform(100, 10000))).quantize(Decimal("0.01"))
        # Отрицательные операции (FREEZE, PAYOUT, COMMISSION, ADJUSTMENT)
        else:
            return -Decimal(str(random.uniform(100, 10000))).quantize(Decimal("0.01"))


class MediaPlanGenerationFactory(DjangoModelFactory):
    class Meta:
        model = MediaPlanGeneration

    requested_by = factory.SubFactory(UserFactory)
    status = MediaPlanGeneration.Status.PENDING

    @factory.post_generation
    def campaigns(self, created, extracted, **kwargs):
        if not created:
            return
        campaigns = extracted or [CampaignFactory()]
        for campaign in campaigns:
            self.campaigns.add(campaign)
