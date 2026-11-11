-- channelMessageId зберігає JSON-масив message_id (напр. "[1800]"), не один INTEGER
ALTER TABLE "TelegramListing"
  ALTER COLUMN "channelMessageId" TYPE TEXT
  USING CASE
    WHEN "channelMessageId" IS NULL THEN NULL
    ELSE "channelMessageId"::text
  END;
