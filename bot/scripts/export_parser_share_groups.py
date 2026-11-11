#!/usr/bin/env python3
"""Експорт enabled-груп парсера в JSON для Mini App (поширення оголошень)."""

from __future__ import annotations

import json
from pathlib import Path

from parser.config.channels import normalize_channel_key
from parser.config.groups import enabled_groups


def invite_link(g) -> str:
    raw = (g.key or "").strip()
    if raw.startswith("http"):
        return raw
    nk = normalize_channel_key(raw)
    if nk.startswith("t.me/"):
        return "https://" + nk
    return f"https://t.me/{nk.split('/')[-1]}"


def main() -> None:
    out = []
    for g in enabled_groups():
        key = normalize_channel_key(g.key)
        if not key:
            continue
        out.append(
            {
                "parserKey": key,
                "title": (g.label or g.key).strip(),
                "city": g.city,
                "kind": g.kind,
                "categorySlug": g.default_subcategory,
                "inviteLink": invite_link(g),
                "notes": (g.notes or "").strip() or None,
            }
        )
    path = Path(__file__).resolve().parents[2] / "app" / "data" / "parser-share-groups.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(out)} groups → {path}")


if __name__ == "__main__":
    main()
