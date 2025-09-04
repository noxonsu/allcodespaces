import logging
from functools import wraps
from logging import getLogger, StreamHandler, FileHandler


logger = getLogger(__name__)
logger.addHandler(StreamHandler())
logger.addHandler(FileHandler("./logs/web_app_logger.log"))
logger.setLevel(logging.INFO)


def log_func(func):
    @wraps(func)
    def handler(*args, **kwargs):
        logger.info(f"[INFO]\tFunc: {func.__name__} active and running...")
        res = func(*args, **kwargs)
        logger.info(f"[INFO]\tFunc: {func.__name__}, Result: {res}...")
        logger.info(f"[INFO]\tFunc: {func.__name__} Done...")
        return res

    return handler
