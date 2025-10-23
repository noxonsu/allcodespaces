FROM python:3.13-slim AS builder

LABEL Mainter="Ahmed Mohamed <amohamed@gramant.ru>"

EXPOSE 8000


ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app
COPY . .

# Создать папку для логов
RUN mkdir -p /app/logs && chmod 777 /app/logs

# Отключить Post-Invoke скрипты apt для избежания проблем с runc
RUN echo 'APT::Update::Post-Invoke-Success "";' > /etc/apt/apt.conf.d/99no-post-invoke && \
    apt-get update -y && \
    apt-get install -y --no-install-recommends libssl-dev libffi-dev build-essential libpq-dev python3-dev gcc python3-psycopg2 gettext && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /etc/apt/apt.conf.d/99no-post-invoke

RUN pip install --upgrade pip
RUN pip install uv

RUN uv lock
RUN uv sync --python $(which python) # using system python 
RUN uv pip install --python $(which python) --all-extras -r pyproject.toml # using system python 

# Running statisfiles
CMD python manage.py collectstatic --no-input

# Running Migrations
CMD python manage.py migrate

