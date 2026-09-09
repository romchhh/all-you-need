-- Bot/parser tables not covered by Prisma schema (schemas aligned with Python code)

CREATE TABLE IF NOT EXISTS parsed_items (
    id SERIAL PRIMARY KEY,
    source_channel TEXT NOT NULL,
    source_city TEXT NOT NULL,
    message_id BIGINT NOT NULL,
    media_group_id TEXT,
    author_username TEXT,
    author_id BIGINT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    price TEXT,
    currency TEXT,
    is_free INTEGER DEFAULT 0,
    category TEXT NOT NULL,
    subcategory TEXT,
    condition TEXT,
    location TEXT NOT NULL,
    images_json TEXT,
    raw_text TEXT,
    content_hash TEXT,
    status TEXT DEFAULT 'pending',
    admin_message_id BIGINT,
    marketplace_listing_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    moderated_at TIMESTAMPTZ,
    moderated_by INTEGER,
    dedup_key TEXT,
    parser_type TEXT DEFAULT 'default',
    text_embedding TEXT,
    moderation_chat_id BIGINT,
    admin_message_id_channel BIGINT,
    moderation_chat_id_channel BIGINT,
    marketplace_mod_status TEXT DEFAULT 'pending',
    channel_mod_status TEXT DEFAULT 'pending',
    msg_link TEXT,
    auto_approved INTEGER DEFAULT 0,
    review_note TEXT,
    UNIQUE(source_channel, message_id)
);

CREATE INDEX IF NOT EXISTS idx_parsed_items_content_hash ON parsed_items(content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parsed_items_dedup_key ON parsed_items(dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parsed_items_auto_approved ON parsed_items(auto_approved, moderated_at) WHERE auto_approved = 1;
CREATE INDEX IF NOT EXISTS idx_parsed_items_admin_msg_channel ON parsed_items(admin_message_id_channel) WHERE admin_message_id_channel IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parsed_items_created_at ON parsed_items(created_at);

CREATE TABLE IF NOT EXISTS parsed_skips (
    id SERIAL PRIMARY KEY,
    source_channel TEXT NOT NULL,
    source_city TEXT,
    message_id INTEGER,
    skip_reason TEXT NOT NULL,
    title TEXT,
    description TEXT,
    category TEXT,
    raw_text_preview TEXT,
    msg_link TEXT,
    parser_type TEXT DEFAULT 'default',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parsed_skips_created ON parsed_skips(created_at);
CREATE INDEX IF NOT EXISTS idx_parsed_skips_reason ON parsed_skips(skip_reason);
CREATE INDEX IF NOT EXISTS idx_parsed_skips_channel_msg ON parsed_skips(source_channel, message_id);

CREATE TABLE IF NOT EXISTS parser_channel_cursors (
    source_channel TEXT NOT NULL,
    parser_type TEXT NOT NULL DEFAULT 'default',
    last_message_id INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (source_channel, parser_type)
);

CREATE TABLE IF NOT EXISTS parser_accounts (
    id SERIAL PRIMARY KEY,
    api_id INTEGER NOT NULL,
    api_hash TEXT NOT NULL,
    phone TEXT NOT NULL,
    telegram_id BIGINT NOT NULL DEFAULT 0,
    username TEXT NOT NULL DEFAULT '',
    session_name TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    last_error TEXT NOT NULL DEFAULT '',
    parse_runs INTEGER NOT NULL DEFAULT 0,
    parse_ok INTEGER NOT NULL DEFAULT 0,
    parse_errors INTEGER NOT NULL DEFAULT 0,
    dm_sent INTEGER NOT NULL DEFAULT 0,
    dm_errors INTEGER NOT NULL DEFAULT 0,
    last_parse_at DOUBLE PRECISION NOT NULL DEFAULT 0,
    last_dm_at DOUBLE PRECISION NOT NULL DEFAULT 0,
    flood_until DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at DOUBLE PRECISION NOT NULL,
    updated_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS parser_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);

-- Legacy Monobay payments table (bot/database_functions/payments_db.py)
CREATE TABLE IF NOT EXISTS payments (
    payment_id TEXT,
    invoice_id TEXT PRIMARY KEY,
    user_id BIGINT,
    product_id INTEGER,
    months INTEGER,
    amount DOUBLE PRECISION,
    status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS LinkVisit (
    id SERIAL PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_id BIGINT NOT NULL,
    visitor_user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_link_visit_source ON LinkVisit(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_link_visit_visitor ON LinkVisit(visitor_user_id);

CREATE TABLE IF NOT EXISTS users_legacy (
    id INTEGER PRIMARY KEY,
    user_id NUMERIC,
    user_name TEXT,
    user_first_name TEXT,
    user_last_name TEXT,
    user_phone TEXT,
    language TEXT,
    join_date TEXT,
    last_activity TEXT,
    ref_link INTEGER
);

CREATE TABLE IF NOT EXISTS "CityDigestQueue" (
    id SERIAL PRIMARY KEY,
    "listingId" INTEGER NOT NULL,
    "cityKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "processedAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_citydigestqueue_processed ON "CityDigestQueue"("processedAt");
CREATE INDEX IF NOT EXISTS idx_citydigestqueue_city ON "CityDigestQueue"("cityKey");
CREATE UNIQUE INDEX IF NOT EXISTS ux_citydigestqueue_listing ON "CityDigestQueue"("listingId");

CREATE TABLE IF NOT EXISTS "WeeklyBroadcastState" (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    "nextMessageIndex" INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "WeeklyBroadcastState" (id, "nextMessageIndex")
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS "WeeklyBroadcastLog" (
    id SERIAL PRIMARY KEY,
    "slotKey" TEXT NOT NULL UNIQUE,
    "dayOfWeek" TEXT NOT NULL,
    "messageIndex" INTEGER NOT NULL,
    "messagePreview" TEXT NOT NULL,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ NOT NULL,
    "finishedAt" TIMESTAMPTZ
);

-- Dynamic TelegramListing columns (also ensured at runtime)
ALTER TABLE "TelegramListing" ADD COLUMN IF NOT EXISTS "priceDisplay" TEXT;
ALTER TABLE "TelegramListing" ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE "TelegramListing" ADD COLUMN IF NOT EXISTS "marketplaceListingId" INTEGER;
ALTER TABLE "TelegramListing" ADD COLUMN IF NOT EXISTS "channelMessageId" INTEGER;

-- UserSession (admin stats + activity tracking)
CREATE TABLE IF NOT EXISTS "UserSession" (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "lastActiveAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE("userId", "telegramId")
);

CREATE INDEX IF NOT EXISTS idx_usersession_userid ON "UserSession"("userId");
CREATE INDEX IF NOT EXISTS idx_usersession_telegramid ON "UserSession"("telegramId");
CREATE INDEX IF NOT EXISTS idx_usersession_lastactive ON "UserSession"("lastActiveAt");
