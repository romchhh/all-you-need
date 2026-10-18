#!/usr/bin/env python3
"""Readonly аудит parsed_skips / rejected parsed_items за останні N днів.

Запуск з bot/:
  python -m parser.scripts.audit_parser_skips
  python -m parser.scripts.audit_parser_skips --days 14 --samples 40
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from typing import Any

# «Сірі» причини — можуть ховати хороші оголошення
_GRAY_REASONS = (
    "ai відхилено",
    "немає фото",
    "замало тексту",
    "замало тексту без фото",
    "не оголошення",
    "дублікат (маркетплейс)",
    "дублікат (крос-канал)",
    "дублікат (оголошення)",
    "немає оферу",
)


def _row(r: Any) -> dict:
    if isinstance(r, dict):
        return r
    if hasattr(r, "keys"):
        return {k: r[k] for k in r.keys()}
    return dict(r)


def _preview(text: str, n: int = 160) -> str:
    t = " ".join((text or "").split())
    return t if len(t) <= n else t[: n - 1] + "…"


def run_audit(*, days: int = 14, samples: int = 40) -> dict:
    from parser.storage.connection import get_connection
    from parser.storage.parsed_skips import ensure_parsed_skips_table

    ensure_parsed_skips_table()
    window = f"-{int(days)} days"
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT skip_reason, COUNT(*) AS cnt
        FROM parsed_skips
        WHERE datetime(created_at) >= datetime('now', ?)
        GROUP BY skip_reason
        ORDER BY cnt DESC
        """,
        (window,),
    )
    skip_counts = [(_row(r)["skip_reason"], int(_row(r)["cnt"])) for r in cur.fetchall()]
    total_skips = sum(c for _, c in skip_counts)

    gray_samples: dict[str, list[dict]] = {}
    per_reason = max(3, samples // max(1, len(_GRAY_REASONS)))
    for reason in _GRAY_REASONS:
        cur.execute(
            """
            SELECT source_channel, message_id, title, description, category,
                   raw_text_preview, skip_reason, created_at
            FROM parsed_skips
            WHERE skip_reason = ?
              AND datetime(created_at) >= datetime('now', ?)
            ORDER BY id DESC
            LIMIT ?
            """,
            (reason, window, per_reason),
        )
        rows = [_row(r) for r in cur.fetchall()]
        if rows:
            gray_samples[reason] = rows

    cur.execute(
        """
        SELECT id, source_channel, title, description, category, subcategory,
               status, raw_text, created_at
        FROM parsed_items
        WHERE LOWER(COALESCE(status, '')) = 'rejected'
          AND datetime(created_at) >= datetime('now', ?)
        ORDER BY id DESC
        LIMIT ?
        """,
        (window, samples),
    )
    rejected = [_row(r) for r in cur.fetchall()]

    cur.execute(
        """
        SELECT COALESCE(category, '') AS category, COUNT(*) AS cnt
        FROM parsed_items
        WHERE LOWER(COALESCE(status, '')) = 'rejected'
          AND datetime(created_at) >= datetime('now', ?)
        GROUP BY COALESCE(category, '')
        ORDER BY cnt DESC
        LIMIT 25
        """,
        (window,),
    )
    rejected_cats = [
        (_row(r)["category"] or "(empty)", int(_row(r)["cnt"])) for r in cur.fetchall()
    ]

    conn.close()

    recommendations: list[str] = []
    reason_share = {
        reason: (cnt / total_skips if total_skips else 0.0) for reason, cnt in skip_counts
    }

    # Евристики рекомендацій за часткою / змістом вибірки
    if reason_share.get("немає фото", 0) >= 0.08:
        recommendations.append(
            "Висока частка «немає фото»: короткі офери з ціною вже пропускаються "
            "is_quality; перевірити чи runner передає has_photo для альбомів."
        )
    if reason_share.get("замало тексту", 0) + reason_share.get("замало тексту без фото", 0) >= 0.1:
        recommendations.append(
            "Багато «замало тексту»: можливі валідні «Продам X 50€» — послабити "
            "мінімум при PRICE_RE / LISTING_OFFER_RE (залишити жорстким без оферу)."
        )
    if any(r.startswith("ai") or "ai " in r for r, _ in skip_counts):
        recommendations.append(
            "AI-відхилення: глянути вибірку — false reject на послуги/beauty vs junk; "
            "не відкривати fail-open широко."
        )
    if reason_share.get("не оголошення", 0) >= 0.1:
        recommendations.append(
            "«не оголошення»: перевірити CHAT_OR_META_RE / NOT_LISTING_RE на хибні "
            "спрацьовування з реальним офером (has_listing_offer_signal вже рятує meta)."
        )
    for reason, rows in gray_samples.items():
        offerish = 0
        for row in rows:
            blob = f"{row.get('title') or ''} {row.get('raw_text_preview') or ''}"
            if any(
                tok in blob.lower()
                for tok in ("продам", "продаю", "€", "eur", "віддам", "отдам", "ціна", "цена")
            ):
                offerish += 1
        if rows and offerish >= max(2, len(rows) // 2) and reason in (
            "немає фото",
            "замало тексту",
            "замало тексту без фото",
            "не оголошення",
            "ai відхилено",
        ):
            recommendations.append(
                f"У вибірці «{reason}» ≥половини з офер-сигналом — кандидат на точкове послаблення."
            )

    if not recommendations:
        recommendations.append(
            "Явних широких дірок у топі причин немає; лишати жорсткими куплю/вакансії/спам."
        )
    recommendations.append(
        "Куплю / вакансії / SPAM_RE — не послаблювати без окремих доказів false positive."
    )

    report = {
        "days": days,
        "total_skips": total_skips,
        "skip_reason_top": [
            {
                "reason": reason,
                "count": cnt,
                "share": round(cnt / total_skips, 4) if total_skips else 0.0,
            }
            for reason, cnt in skip_counts[:30]
        ],
        "gray_sample_counts": {k: len(v) for k, v in gray_samples.items()},
        "gray_samples": {
            reason: [
                {
                    "channel": r.get("source_channel"),
                    "message_id": r.get("message_id"),
                    "category": r.get("category"),
                    "title": _preview(str(r.get("title") or ""), 80),
                    "text": _preview(str(r.get("raw_text_preview") or ""), 140),
                }
                for r in rows
            ]
            for reason, rows in gray_samples.items()
        },
        "rejected_sample_count": len(rejected),
        "rejected_categories": [
            {"category": cat, "count": cnt} for cat, cnt in rejected_cats
        ],
        "rejected_samples": [
            {
                "id": r.get("id"),
                "channel": r.get("source_channel"),
                "category": r.get("category"),
                "subcategory": r.get("subcategory"),
                "title": _preview(str(r.get("title") or ""), 80),
                "text": _preview(str(r.get("raw_text") or r.get("description") or ""), 140),
            }
            for r in rejected[:20]
        ],
        "recommendations": recommendations,
    }
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Audit parser skips / rejected")
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument("--samples", type=int, default=40)
    parser.add_argument("--json", action="store_true", help="Друкувати повний JSON")
    args = parser.parse_args(argv)

    try:
        report = run_audit(days=args.days, samples=args.samples)
        # Якщо вікно порожнє (старий дамп БД) — розширюємо до 120 днів.
        if report["total_skips"] == 0 and args.days < 120:
            report = run_audit(days=120, samples=args.samples)
    except Exception as e:
        print(f"audit failed: {e}", file=sys.stderr)
        return 1

    print(f"=== Parser skip audit (last {report['days']} days) ===")
    print(f"Total skips: {report['total_skips']}")
    print("\nTop skip_reason:")
    for row in report["skip_reason_top"][:20]:
        pct = 100.0 * float(row["share"])
        print(f"  {row['count']:5d} ({pct:5.1f}%)  {row['reason']}")

    print("\nGray samples:")
    for reason, rows in report["gray_samples"].items():
        print(f"  [{reason}] {len(rows)} examples")
        for s in rows[:3]:
            print(f"    - {s['channel']} #{s['message_id']}: {s['title']}")
            print(f"      {s['text']}")

    print("\nRejected categories:")
    for row in report["rejected_categories"][:15]:
        print(f"  {row['count']:5d}  {row['category']}")

    print("\nRecommendations:")
    for line in report["recommendations"]:
        print(f"  • {line}")

    if args.json:
        print("\n" + json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
