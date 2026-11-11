from utils.telegram_listing_price import (
    channel_price_text,
    listing_is_negotiable,
    marketplace_price_and_free,
)


def test_negotiable_with_zero_price_and_display():
    listing = {
        "price": 0,
        "priceDisplay": "Договірна",
        "category": "Послуги",
    }
    assert listing_is_negotiable(listing)
    price, is_free = marketplace_price_and_free(listing)
    assert is_free is False
    assert "огов" in price.lower()
    assert channel_price_text(listing, lang="ru") == "Договорная"


def test_zero_price_service_without_display_is_negotiable():
    listing = {"price": 0, "priceDisplay": None, "category": "Послуги"}
    assert listing_is_negotiable(listing)
    price, is_free = marketplace_price_and_free(listing)
    assert is_free is False
    assert price != "0"


def test_numeric_price():
    listing = {"price": 50, "priceDisplay": "50", "category": "Товари"}
    assert not listing_is_negotiable(listing)
    price, is_free = marketplace_price_and_free(listing)
    assert price == "50"
    assert is_free is False
