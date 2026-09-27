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
      ca-certificates \
      curl \
      gnupg \
      tzdata \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      gcc \
      g++ \
      postgresql-client-18 \
 && rm -rf /var/lib/apt/lists/* \
 && ln -snf /usr/share/zoneinfo/Europe/Kyiv /etc/localtime \
 && echo Europe/Kyiv > /etc/timezone

COPY bot/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt \
 && apt-get purge -y gcc g++ \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

COPY bot/ ./
COPY scripts/ /app/scripts/
COPY docker/bot-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
 && mkdir -p \
      /app/database/parsed_photos \
      /app/app/public/listings/originals \
      /app/app/public/avatars \
      /app/bot/parser/sessions \
      /app/bot/logs

ENTRYPOINT ["/entrypoint.sh"]
