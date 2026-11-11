from utils.listing_images import parse_listing_images, normalize_media_for_db


def test_parse_already_list_not_wiped():
    raw = [{"type": "photo", "file_id": "AgACAg"}]
    assert parse_listing_images(raw) == raw


def test_parse_json_string():
    raw = '[{"type":"photo","file_id":"ABC"}]'
    assert parse_listing_images(raw)[0]["file_id"] == "ABC"


def test_parse_plain_file_id_string():
    assert parse_listing_images("AgACAgIX") == ["AgACAgIX"]


def test_parse_empty():
    assert parse_listing_images(None) == []
    assert parse_listing_images("[]") == []
    assert parse_listing_images("") == []


def test_normalize_media():
    media = normalize_media_for_db(["id1", {"type": "video", "file_id": "v1"}])
    assert media == [
        {"type": "photo", "file_id": "id1"},
        {"type": "video", "file_id": "v1"},
    ]
