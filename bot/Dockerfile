# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/bot \
    TZ=Europe/Kyiv \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/bot

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      gcc \
      g++ \
      ca-certificates \
      tzdata \
 && rm -rf /var/lib/apt/lists/* \
 && ln -snf /usr/share/zoneinfo/Europe/Kyiv /etc/localtime \
 && echo Europe/Kyiv > /etc/timezone

COPY bot/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt \
 && apt-get purge -y gcc g++ \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

COPY bot/ ./
COPY docker/bot-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
 && mkdir -p \
      /app/database/parsed_photos \
      /app/app/public/listings/originals \
      /app/app/public/avatars \
      /app/bot/parser/sessions \
      /app/bot/logs

ENTRYPOINT ["/entrypoint.sh"]
