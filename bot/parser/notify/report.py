"""Текстові звіти про цикл парсингу (ручний / плановий)."""

from __future__ import annotations

import html


def format_parser_stats(
    stats: dict | None,
    *,
    scheduled: bool = False,
    lookback: int | None = None,
    skip_note: str | None = None,
) -> str:
    """HTML-текст звіту для Telegram."""
    if skip_note:
        title = "⏸ <b>Плановий парсинг</b>" if scheduled else "⏸ <b>Парсинг</b>"
        return f"{title}\n\n{html.escape(skip_note.strip())}"

    if not stats:
        if scheduled:
            return (
                "❌ <b>Плановий парсинг не виконано</b>\n\n"
                "Перевір логи бота або акаунти в «Парсер акаунти»."
            )
        return (
            "❌ <b>Парсинг не виконано</b>\n\n"
            "Перевір логи бота або акаунти в «Парсер акаунти»."
        )

    added = int(stats.get("added") or 0)
    skipped = int(stats.get("skipped") or 0)
    channels = stats.get("channels")
    errors = stats.get("errors") or []
    reasons = stats.get("reasons") or {}
    stats_lookback = stats.get("lookback")
    effective_lookback = lookback if lookback is not None else stats_lookback

    if scheduled:
        lines = ["📊 <b>Плановий парсинг завершено</b>", ""]
    else:
        lines = ["✅ <b>Парсинг завершено</b>", ""]

    lines.extend(
        [
            f"➕ Нових: <b>{added}</b>",
            f"⏭ Пропущено: <b>{skipped}</b>",
        ]
    )
    if effective_lookback:
        lines.append(f"📥 Останні <b>{effective_lookback}</b> постів на канал")
    else:
        from parser.config.settings import PARSER_ROLLING_LOOKBACK

        if PARSER_ROLLING_LOOKBACK > 0:
            lines.append(f"📥 Останні <b>{PARSER_ROLLING_LOOKBACK}</b> постів на канал")
        else:
            lines.append("📍 Інкрементально (cursor + overlap)")
    if channels is not None:
        lines.append(f"📢 Груп/каналів: <b>{channels}</b>")

    if reasons:
        lines.append("")
        lines.append("<b>Причини пропуску:</b>")
        for reason, count in sorted(reasons.items(), key=lambda x: -x[1])[:8]:
            lines.append(f"• {html.escape(reason)}: {count}")

    if errors:
        lines.append("")
        lines.append(f"⚠️ Помилок каналів: <b>{len(errors)}</b>")
        for err in errors[:3]:
            ch = html.escape(str(err.get("channel", "?")))
            msg = html.escape(str(err.get("error", ""))[:120])
            lines.append(f"• {ch}: <code>{msg}</code>")

    if scheduled:
        from parser.config.settings import PARSER_INTERVAL_MIN

        lines.append("")
        lines.append(f"⏱ Наступний плановий запуск через ~{PARSER_INTERVAL_MIN} хв.")
    else:
        lines.append("")
        lines.append(
            "Модерація (3 групи):\n"
            "• Hamburg послуги → канал Hamburg + маркетплейс\n"
            "• Germany послуги → канал Germany + маркетплейс\n"
            "• Товари → лише маркетплейс\n\n"
            "💡 <code>/parse</code> — останні 100 постів на канал\n"
            "💡 <code>/parse200</code> — глибший catch-up"
        )

    if not scheduled:
        if added == 0 and reasons:
            top_reason = max(reasons.items(), key=lambda x: x[1])[0]
            if "дублікат (оголошення)" in top_reason:
                lines.append("")
                lines.append(
                    "ℹ️ Багато «дублікат (оголошення)» — увімкнено text-dedup "
                    "(<code>PARSER_DEDUP_ENABLED=1</code>). За замовч. він вимкнений."
                )
            elif "дублікат" in top_reason:
                lines.append("")
                lines.append(
                    "ℹ️ +0 нових — усі пости вже з message_id у БД або відфільтровані."
                )
            else:
                lines.append("")
                lines.append(
                    "Якщо очікували нові — спробуйте <code>/parse200</code> або перевірте фільтри."
                )
        elif added == 0:
            lines.append("")
            lines.append("Якщо очікували нові оголошення — можливо канал без нових постів.")

    return "\n".join(lines)
