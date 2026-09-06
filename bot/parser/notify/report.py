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
    auto_approved = int(stats.get("auto_approved") or 0)
    manual_review = stats.get("manual_review")
    if manual_review is None and added > 0:
        manual_review = max(0, added - auto_approved)
    else:
        manual_review = int(manual_review or 0)
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
    if added > 0:
        from parser.config.settings import PARSER_AUTO_APPROVE_TARGET_RATIO

        target_pct = int(round(PARSER_AUTO_APPROVE_TARGET_RATIO * 100))
        pct = round((auto_approved / added) * 1000) / 10 if added else 0
        target_label = "макс." if target_pct >= 100 else f"~{target_pct}%"
        lines.append(
            f"🤖 Автопідтверджено на МП: <b>{auto_approved}</b> "
            f"({pct}% · ціль {target_label})"
        )
        lines.append(f"🕐 На модерацію: <b>{manual_review}</b>")
        if auto_approved > 0:
            lines.append(
                "⚡ <i>Товари → маркетплейс одразу; послуги → канал + маркетплейс</i>"
            )
        auto_skip = stats.get("auto_approve_skip_reasons") or {}
        if auto_approved < int(stats.get("auto_approve_target") or 0) and auto_skip:
            lines.append("")
            lines.append("<b>Чому не автопідтверджено (top):</b>")
            for reason, count in sorted(auto_skip.items(), key=lambda x: -x[1])[:5]:
                lines.append(f"• {html.escape(str(reason))}: {count}")
    elif auto_approved > 0:
        lines.append(f"🤖 Автопідтверджено на МП: <b>{auto_approved}</b>")
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
        account_errors = [e for e in errors if str(e.get("channel", "")).strip() in ("—", "-", "")]
        channel_errors = [e for e in errors if e not in account_errors]
        lines.append("")
        if account_errors:
            lines.append(f"⚠️ Збої акаунтів: <b>{len(account_errors)}</b>")
            for err in account_errors[:3]:
                msg = html.escape(str(err.get("error", ""))[:140])
                lines.append(f"• <code>{msg}</code>")
            if any("database is locked" in str(e.get("error", "")).lower() for e in account_errors):
                lines.append(
                    "ℹ️ <i>database is locked</i> — зазвичай два процеси чіпають SQLite "
                    "(bot на хості + Docker, або два /parse). Залиште один bot і один Next.js."
                )
        if channel_errors:
            lines.append(f"⚠️ Помилок каналів: <b>{len(channel_errors)}</b>")
            for err in channel_errors[:3]:
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
            "• Hamburg послуги → канал Hamburg + маркетплейс (авто)\n"
            "• Germany послуги → канал Germany + маркетплейс (авто)\n"
            "• Товари → маркетплейс одразу (авто)\n\n"
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
                    "(tuning.py: <code>PARSER_DEDUP_ENABLED=True</code>). За замовч. вимкнено."
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
