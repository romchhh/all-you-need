"""
Налаштування обсягу парсера та автопублікації на маркетплейс.

Редагуйте тут — не через .env (окремо лише секрети: OPENAI_API_KEY, TOKEN тощо).
"""

from __future__ import annotations

# ── Цикл парсингу ─────────────────────────────────────────────
PARSER_INTERVAL_MIN: float = 15.0
PARSER_ROLLING_LOOKBACK: int = 0
PARSER_FETCH_LIMIT: int = 100
PARSER_SERVICES_FETCH_LIMIT: int = 100
# 0 = cursor+overlap (лише нові); True = завжди останні N (ігнор cursor)
PARSER_SERVICES_IGNORE_CURSOR: bool = False
# Скільки останніх message_id перечитати поверх cursor
PARSER_CURSOR_OVERLAP: int = 25

# ── Dedup ─────────────────────────────────────────────────────
PARSER_DEDUP_ENABLED: bool = True
PARSER_SERVICES_DEDUP_ENABLED: bool = True
PARSER_DEDUP_DAYS: int = 14
# Вікно dedup_key (title+desc+price) для services без MP
PARSER_TEXT_DEDUP_DAYS: int = 2
# Pending у модерації блокує повтор лише N годин
PARSER_PENDING_DEDUP_HOURS: int = 36
PARSER_FUZZY_DEDUP_ENABLED: bool = False
PARSER_FUZZY_DEDUP_SAME_CHANNEL: bool = True
PARSER_FUZZY_DEDUP_THRESHOLD: float = 0.94

# ── AI-фільтр (ключ OPENAI_API_KEY — лише в .env) ─────────────
PARSER_AI_ENABLED: bool = True
PARSER_AI_SCREEN_ENABLED: bool = True

# ── Канали: робоче вікно 08:00–20:00 Europe/Berlin ────────────
# Тиша (quiet): 20:00–08:00 — нічого в канали / auto-approve drain
PARSER_CHANNEL_QUIET_START_HOUR: int = 20
PARSER_CHANNEL_QUIET_END_HOUR: int = 8
PARSER_CHANNEL_QUIET_TZ: str = "Europe/Berlin"

# ── Автопублікація (~450/день) ────────────────────────────────
# Товари та послуги → маркетплейс одразу після parse.
# У Telegram-канали — лише вручну (кнопка модерації), не автоматом.
PARSER_AUTO_APPROVE_ENABLED: bool = True
PARSER_AUTO_APPROVE_DAILY_LIMIT: int = 450
# Backlog drain (кожні N хв) — aggressive, без хвильового throttling
PARSER_AUTO_APPROVE_INTERVAL_MIN: float = 2.0
PARSER_AUTO_APPROVE_BATCH: int = 80
PARSER_AUTO_APPROVE_MAX_PER_CHANNEL: int = 60
PARSER_AUTO_APPROVE_MAX_PER_CATEGORY: int = 120
PARSER_AUTO_APPROVE_MAX_AGE_HOURS: int = 72
PARSER_AUTO_APPROVE_WAVE_MINUTES: int = 5
PARSER_AUTO_APPROVE_SERVICES_CHANNEL: bool = False
# CTA «Business-профиль» у DM авторам послуг — увімкнути після готовності вітрини
PARSER_AUTHOR_DM_BUSINESS_CTA: bool = False
# Рівномірний денний бюджет — вимкнено: backlog публікується протягом дня (2-хв job + parse-time)
PARSER_AUTO_APPROVE_PACE_ENABLED: bool = False
PARSER_AUTO_APPROVE_PACE_BUFFER_MIN: int = 45
# Ручний /parse + scheduled backlog: rounds aggressive drain
PARSER_AUTO_APPROVE_MANUAL_DRAIN_ROUNDS: int = 12
PARSER_AUTO_APPROVE_SCHEDULED_DRAIN_ROUNDS: int = 8
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
