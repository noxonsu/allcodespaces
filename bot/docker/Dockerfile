FROM python:3.13-slim AS builder

MAINTAINER "Ahmed Mohamed <amohamed@gramant.ru>"

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1


WORKDIR /bot

COPY . .

RUN pip install --upgrade pip
RUN pip install poetry
#RUN poetry config virtualenvs.in-project false # Do not create vir-env, use current env
#RUN poetry config virtualenvs.create false # Do not create vir-env, use current env
RUN poetry install --no-root
