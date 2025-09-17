FROM python:3.13-slim AS builder

LABEL Mainter="Ahmed Mohamed <amohamed@gramant.ru>"

EXPOSE 8000


ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app
COPY . .

RUN apt-get update -y
RUN apt-get install -y libssl-dev libffi-dev build-essential libpq-dev python3-dev gcc python3-psycopg2 # needed to install some lib related with DB
RUN apt-get install -y gettext # needed to translation

RUN pip install --upgrade pip
RUN pip install uv

RUN uv lock
RUN uv sync --python $(which python) # using system python 
RUN uv pip install --python $(which python) --all-extras -r pyproject.toml # using system python 

# Running statisfiles
CMD python manage.py collectstatic --no-input

# Running Migrations
CMD python manage.py migrate

