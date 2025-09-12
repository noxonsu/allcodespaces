from django.core.management import BaseCommand

from core.models import Channel
from core.utils import update_broken_channel_avatar
from web_app.logger import logger


class Command(BaseCommand):

    def handle(self, *args, **options):
        logger.info('[COMMAND] Updating channels avatar!')
        update_broken_channel_avatar()
        logger.info('[COMMAND] Updating channels avatar is DONE!')
