import logging
from functools import wraps
from logging import getLogger, StreamHandler, FileHandler
from pathlib import Path


logger = getLogger(__name__)
log_dir = Path(__file__).resolve().parent.parent / "logs"
log_dir.mkdir(parents=True, exist_ok=True)
logger.addHandler(StreamHandler())
logger.addHandler(FileHandler(log_dir / "web_app_logger.log"))
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
