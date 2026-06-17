from parser.config.channels import (
    BEAUTY_SERVICE_CHANNELS,
    CHANNELS,
    CHANNELS_STRIP_TRAILING_LINK,
    SERVICE_CHANNELS,
    SERVICE_ONLY_CHANNELS,
    dedupe_channels,
    normalize_channel_key,
)
from parser.config.settings import (
    FETCH_LIMIT,
    PHOTOS_DIR,
    REPO_ROOT,
    SERVICES_MODERATION_CHANNEL_ID,
)

__all__ = [
    "BEAUTY_SERVICE_CHANNELS",
    "CHANNELS",
    "CHANNELS_STRIP_TRAILING_LINK",
    "FETCH_LIMIT",
    "PHOTOS_DIR",
    "REPO_ROOT",
    "SERVICE_CHANNELS",
    "SERVICE_ONLY_CHANNELS",
    "SERVICES_MODERATION_CHANNEL_ID",
    "dedupe_channels",
    "normalize_channel_key",
]
