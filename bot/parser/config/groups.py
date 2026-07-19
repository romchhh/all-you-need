"""
Реєстр Telegram-груп/каналів для парсера.

kind:
  goods    — товари / змішані барахолки (AI сам відсіє сміття і позначить послуги)
  services — переважно послуги (краса, майстри, виїзди)

Місто — німецька оригінальна назва (Berlin, München, Köln, …).
enabled=False — не парсимо (робота, новини, міські чати без оголошень).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

GroupKind = Literal["goods", "services"]


@dataclass(frozen=True)
class ParserGroup:
    key: str
    city: str
    kind: GroupKind
    label: str = ""
    default_subcategory: Optional[str] = None
    strip_trailing_link: bool = False
    enabled: bool = True
    notes: str = ""


GROUPS: tuple[ParserGroup, ...] = (
    # ═══════════════════════════════════════════
    # Berlin
    # ═══════════════════════════════════════════
    ParserGroup("baraholkaberlin", "Berlin", "goods", label="Барахолка Berlin"),
    ParserGroup(
        "kaufberli",
        "Berlin",
        "goods",
        label="Kauf Berlin",
        notes="Багато товарів + послуги по Берліну",
    ),
    ParserGroup(
        "nash_berlin_market",
        "Berlin",
        "goods",
        label="Nash Berlin Market",
        notes="Товари + послуги",
    ),
    ParserGroup(
        "berlin_ua2",
        "Berlin",
        "goods",
        label="Berlin UA 2",
        notes="Товари і послуги, багато послуг",
    ),
    ParserGroup("Berlin_UA2025", "Berlin", "goods", label="Berlin UA 2025"),
    ParserGroup(
        "beauty_berlin_ua",
        "Berlin",
        "services",
        label="Beauty Berlin UA",
        default_subcategory="beauty_services",
        notes="Б'юті послуги в Берліні",
    ),
    # ═══════════════════════════════════════════
    # Hamburg
    # ═══════════════════════════════════════════
    ParserGroup(
        "secondhand_hh",
        "Hamburg",
        "goods",
        label="Secondhand HH / БарахлаНЕТ",
        strip_trailing_link=True,
        notes="Товари/послуги (~1500)",
    ),
    ParserGroup("gamburg_baraxlanet", "Hamburg", "goods", label="Gamburg Baraxlanet"),
    ParserGroup(
        "HamburgLifeUA",
        "Hamburg",
        "goods",
        label="Hamburg Life UA",
        notes="Послуги + товари",
    ),
    ParserGroup(
        "alleindeutschland",
        "Hamburg",
        "goods",
        label="Allein Deutschland",
        notes="Послуги/товари",
    ),
    ParserGroup(
        "NashKleinHamburg",
        "Hamburg",
        "goods",
        label="Nash Klein Hamburg",
    ),
    ParserGroup(
        "HamburgBeauty",
        "Hamburg",
        "services",
        label="Hamburg Beauty",
        default_subcategory="beauty_services",
        notes="Б'юті, заходи, трохи товарів",
    ),
    ParserGroup(
        "Hamburggggggg",
        "Hamburg",
        "services",
        label="Hamburg Services",
        default_subcategory="other_services",
    ),
    # ═══════════════════════════════════════════
    # Düsseldorf / Essen / Dortmund / NRW
    # ═══════════════════════════════════════════
    ParserGroup(
        "komissionkaDusseldorf",
        "Düsseldorf",
        "goods",
        label="Komissionka Düsseldorf",
    ),
    ParserGroup(
        "komissionkaEssen",
        "Essen",
        "goods",
        label="Komissionka Essen",
    ),
    ParserGroup(
        "baraholka_essen",
        "Essen",
        "goods",
        label="Барахолка Essen",
        notes="Товари, мало послуг (username @baraholka_essen04)",
    ),
    ParserGroup(
        "top_market_nrw",
        "NRW",
        "goods",
        label="Top Market NRW",
        notes="Товари/послуги",
    ),
    ParserGroup(
        "barahlanet2024",
        "NRW",
        "goods",
        label="Barahlanet 2024",
        notes="Послуги + товари",
    ),
    ParserGroup(
        "prodaw_tovariv_NRW",
        "NRW",
        "goods",
        label="Продаж товарів NRW",
    ),
    ParserGroup(
        "prodajanrw",
        "NRW",
        "goods",
        label="Prodaja NRW",
    ),
    ParserGroup(
        "Flohmarkt_Marl",
        "NRW",
        "goods",
        label="Flohmarkt Marl",
    ),
    ParserGroup(
        "https://t.me/+Bn8EvoTTQaQzYjQy",
        "NRW",
        "goods",
        label="NRW invite group",
        notes="Послуги/товари",
    ),
    ParserGroup(
        "https://t.me/+u9VcbxuhKik1M2My",
        "Dülmen",
        "goods",
        label="Dülmen / Münster / Bochum (@khutpb)",
        notes="Товари/послуги",
    ),
    ParserGroup(
        "DortmundBaraholka1",
        "Dortmund",
        "services",
        label="Dortmund Baraholka",
        default_subcategory="other_services",
        notes="Більше послуг: перевезення / подорожі",
    ),
    ParserGroup(
        "BeautyNRW",
        "NRW",
        "services",
        label="Beauty NRW",
        default_subcategory="beauty_services",
    ),
    ParserGroup(
        "BeautyDusseldorf",
        "Düsseldorf",
        "services",
        label="Beauty Düsseldorf",
        default_subcategory="beauty_services",
    ),
    ParserGroup(
        "https://t.me/+Yeu9vchwu6llZmYy",
        "NRW",
        "services",
        label="NRW Beauty invite",
        default_subcategory="beauty_services",
        notes="Б'юті послуги",
    ),
    ParserGroup(
        "amBestenBeauty",
        "NRW",
        "services",
        label="Am Besten Beauty",
        default_subcategory="beauty_services",
        notes="Б'юті послуги",
    ),
    # ═══════════════════════════════════════════
    # München / Bayern
    # ═══════════════════════════════════════════
    ParserGroup("Flohmark11", "München", "goods", label="Flohmarkt München"),
    ParserGroup("bazarmuc5", "München", "goods", label="Bazar München"),
    ParserGroup(
        "beautymuenchen",
        "München",
        "services",
        label="Beauty München",
        default_subcategory="beauty_services",
    ),
    # ═══════════════════════════════════════════
    # Nürnberg
    # ═══════════════════════════════════════════
    ParserGroup(
        "nurnberg_ukraine",
        "Nürnberg",
        "goods",
        label="Nürnberg Ukraine",
    ),
    # nurnberg_ua — USERNAME_NOT_OCCUPIED (канал видалено / username зайнятий іншим)
    ParserGroup(
        "nurnberg_ua",
        "Nürnberg",
        "goods",
        label="Nürnberg UA",
        enabled=False,
        notes="USERNAME_NOT_OCCUPIED — вимкнено",
    ),
    ParserGroup(
        "NASH_NURNBERG_INFO",
        "Nürnberg",
        "goods",
        label="Nash Nürnberg Info",
    ),
    # ═══════════════════════════════════════════
    # Stuttgart
    # ═══════════════════════════════════════════
    ParserGroup("BaraholkaStuttgart", "Stuttgart", "goods", label="Барахолка Stuttgart"),
    ParserGroup("UaStuttgart", "Stuttgart", "goods", label="UA Stuttgart"),
    ParserGroup("Stuttgart_sms", "Stuttgart", "goods", label="Stuttgart SMS"),
    ParserGroup("prodam_stuttgart", "Stuttgart", "goods", label="Продам Stuttgart"),
    ParserGroup("BWHUBGermany", "Stuttgart", "goods", label="BW Hub Germany"),
    ParserGroup(
        "doctordior2310",
        "Stuttgart",
        "services",
        label="Doctor Dior Beauty",
        default_subcategory="beauty_services",
    ),
    # ═══════════════════════════════════════════
    # Leipzig / Magdeburg / Regensburg / Frankfurt / Köln
    # ═══════════════════════════════════════════
    ParserGroup("Leipzig_Flohmarkt", "Leipzig", "goods", label="Leipzig Flohmarkt"),
    ParserGroup(
        "FlohmarktMagdeburg",
        "Magdeburg",
        "goods",
        label="Flohmarkt Magdeburg",
    ),
    ParserGroup(
        "FlohmarktRegensburg",
        "Regensburg",
        "goods",
        label="Flohmarkt Regensburg",
    ),
    ParserGroup("ukraincifrankfurt", "Frankfurt", "goods", label="Ukrainci Frankfurt"),
    ParserGroup(
        "FrankfurtamMaincity",
        "Frankfurt",
        "goods",
        label="Frankfurt am Main",
    ),
    ParserGroup("keln3", "Köln", "goods", label="Köln барахолка"),
    # ═══════════════════════════════════════════
    # Germany-wide / загальні барахолки
    # ═══════════════════════════════════════════
    ParserGroup(
        "nimechyna_pidtrymka",
        "Germany",
        "goods",
        label="Німеччина підтримка",
        notes="Багато оголошень для бота",
    ),
    ParserGroup(
        "ukraineingermany",
        "Germany",
        "goods",
        label="Ukraine in Germany",
    ),
    ParserGroup(
        "deutschland_diaspora",
        "Germany",
        "goods",
        label="Deutschland Diaspora",
    ),
    ParserGroup(
        "UkraineGermaniaxxxx",
        "Germany",
        "goods",
        label="Ukraine Germania",
    ),
    ParserGroup(
        "htjjL0WQOk23QyNjYy",
        "Germany",
        "goods",
        label="Загальна барахолка",
    ),
    ParserGroup("inf0dorf", "Germany", "goods", label="Info Dorf"),
    ParserGroup("ogoloschennja", "Germany", "goods", label="Оголошення"),
    ParserGroup(
        "NRW_UA2025",
        "Germany",
        "goods",
        label="NRW UA 2025",
        notes="Загальна, послуги/товари",
    ),
    ParserGroup(
        "ua_germany_hel",
        "Germany",
        "goods",
        label="UA Germany Help",
        notes="Робота, житло і послуги — AI відсіє вакансії",
    ),
    ParserGroup(
        "AutoClub_Markt_Deutschland",
        "Germany",
        "goods",
        label="Auto Club Markt",
        notes="Авто",
    ),
    ParserGroup("auto_basar", "Germany", "goods", label="Auto Basar", notes="Авто"),
    ParserGroup(
        "beautyswe",
        "Germany",
        "services",
        label="Beauty SWE",
        default_subcategory="beauty_services",
    ),
    ParserGroup(
        "deutschland_de478",
        "Germany",
        "services",
        label="Deutschland Services",
        default_subcategory="other_services",
    ),
    # ═══════════════════════════════════════════
    # Вимкнено: робота / новини / міські чати / тури
    # ═══════════════════════════════════════════
    ParserGroup(
        "Robota_Germania",
        "Germany",
        "goods",
        label="Robota Germania",
        enabled=False,
        notes="Лише робота — не парсимо",
    ),
    ParserGroup(
        "za_kordonomu",
        "Germany",
        "goods",
        label="За кордоном",
        enabled=False,
        notes="Робота (суміжно з Польщею)",
    ),
    ParserGroup(
        "germany_ukraine1",
        "Germany",
        "goods",
        label="Germany Ukraine News",
        enabled=False,
        notes="Новини; оголошення лише в коментарях",
    ),
    ParserGroup(
        "nrw_community",
        "NRW",
        "goods",
        label="NRW Community",
        enabled=False,
        notes="Переважно робота / спільнота",
    ),
    ParserGroup(
        "UkrGermanConnect",
        "Germany",
        "services",
        label="Ukr German Connect",
        enabled=False,
        notes="Тури / подорожі",
    ),
    ParserGroup(
        "moidommuc",
        "München",
        "services",
        label="Moi Dom München",
        enabled=False,
        notes="Міський канал / заходи",
    ),
    ParserGroup(
        "https://t.me/+NZfyQsDROTA4ZWM6",
        "Stuttgart",
        "services",
        label="Dosug Stuttgart",
        enabled=False,
        notes="Досуг / заходи",
    ),
)


def enabled_groups() -> list[ParserGroup]:
    return [g for g in GROUPS if g.enabled]


def groups_by_kind(kind: GroupKind) -> list[ParserGroup]:
    return [g for g in enabled_groups() if g.kind == kind]
