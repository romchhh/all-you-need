ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "linkedListingIds" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "highlightCreditsRemaining" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "topCreditsRemaining" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "followersCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "BusinessFollow" (
    "id" SERIAL NOT NULL,
    "businessProfileId" INTEGER NOT NULL,
    "followerUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BusinessFollow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BusinessFollow_businessProfileId_followerUserId_key"
    ON "BusinessFollow"("businessProfileId", "followerUserId");
CREATE INDEX IF NOT EXISTS "BusinessFollow_businessProfileId_idx" ON "BusinessFollow"("businessProfileId");
CREATE INDEX IF NOT EXISTS "BusinessFollow_followerUserId_idx" ON "BusinessFollow"("followerUserId");

ALTER TABLE "BusinessFollow" DROP CONSTRAINT IF EXISTS "BusinessFollow_businessProfileId_fkey";
ALTER TABLE "BusinessFollow" ADD CONSTRAINT "BusinessFollow_businessProfileId_fkey"
    FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessFollow" DROP CONSTRAINT IF EXISTS "BusinessFollow_followerUserId_fkey";
ALTER TABLE "BusinessFollow" ADD CONSTRAINT "BusinessFollow_followerUserId_fkey"
    FOREIGN KEY ("followerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
