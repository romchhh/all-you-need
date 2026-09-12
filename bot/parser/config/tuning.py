"""
Налаштування обсягу парсера та автопублікації на маркетплейс.

Редагуйте тут — не через .env (окремо лише секрети: OPENAI_API_KEY, TOKEN тощо).
"""

from __future__ import annotations

# ── Цикл парсингу ─────────────────────────────────────────────
PARSER_INTERVAL_MIN: float = 15.0
PARSER_ROLLING_LOOKBACK: int = 0
PARSER_DEDUP_ENABLED: bool = False

# ── AI-фільтр (ключ OPENAI_API_KEY — лише в .env) ─────────────
PARSER_AI_ENABLED: bool = True
PARSER_AI_SCREEN_ENABLED: bool = True

# ── Автопублікація (~450/день) ────────────────────────────────
# Товари та послуги → маркетплейс одразу після parse.
# У Telegram-канали — лише вручну (кнопка модерації), не автоматом.
PARSER_AUTO_APPROVE_ENABLED: bool = True
PARSER_AUTO_APPROVE_DAILY_LIMIT: int = 450
PARSER_AUTO_APPROVE_INTERVAL_MIN: float = 3.0
PARSER_AUTO_APPROVE_BATCH: int = 80
PARSER_AUTO_APPROVE_MAX_PER_CHANNEL: int = 250
PARSER_AUTO_APPROVE_MAX_PER_CATEGORY: int = 250
PARSER_AUTO_APPROVE_MAX_AGE_HOURS: int = 72
PARSER_AUTO_APPROVE_WAVE_MINUTES: int = 5
PARSER_AUTO_APPROVE_SERVICES_CHANNEL: bool = False
# Ручний /parse: без хвильових лімітів, добираємо pending до денної квоти
PARSER_AUTO_APPROVE_MANUAL_DRAIN_ROUNDS: int = 12
# 1.0 = усі нові parsed_items одразу на МП (real-time), не 50%
PARSER_AUTO_APPROVE_TARGET_RATIO: float = 1.0

# ── Очищення дублікатів на маркетплейсі ───────────────────────
PARSER_MP_DEDUP_CLEANUP_ENABLED: bool = True
PARSER_MP_DEDUP_CLEANUP_INTERVAL_MIN: float = 60.0
PARSER_MP_DEDUP_CLEANUP_LOOKBACK_DAYS: int = 30

# Жорсткі межі (не змінювати без потреби)
PARSER_AUTO_APPROVE_DAILY_LIMIT_MAX: int = 500
PARSER_AUTO_APPROVE_BATCH_MAX: int = 80
PARSER_AUTO_APPROVE_WAVE_MINUTES_MIN: int = 5
PARSER_AUTO_APPROVE_WAVE_MINUTES_MAX: int = 60
