-- Business profile tables and listing profileType
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "profileType" TEXT NOT NULL DEFAULT 'personal';

CREATE INDEX IF NOT EXISTS "Listing_userId_profileType_idx" ON "Listing"("userId", "profileType");

CREATE TABLE IF NOT EXISTS "BusinessProfile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "businessName" TEXT NOT NULL,
    "logo" TEXT,
    "coverImage" TEXT,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "description" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "serviceArea" TEXT NOT NULL DEFAULT 'city_only',
    "serviceRadiusKm" INTEGER,
    "telegram" TEXT,
    "phone" TEXT,
    "instagram" TEXT,
    "website" TEXT,
    "workingHours" TEXT,
    "plan" TEXT,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'draft',
    "subscriptionEndsAt" TIMESTAMP(3),
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BusinessProfile_userId_key" ON "BusinessProfile"("userId");
CREATE INDEX IF NOT EXISTS "BusinessProfile_subscriptionStatus_idx" ON "BusinessProfile"("subscriptionStatus");
CREATE INDEX IF NOT EXISTS "BusinessProfile_city_idx" ON "BusinessProfile"("city");
CREATE INDEX IF NOT EXISTS "BusinessProfile_category_idx" ON "BusinessProfile"("category");

ALTER TABLE "BusinessProfile" DROP CONSTRAINT IF EXISTS "BusinessProfile_userId_fkey";
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "BusinessSubscriptionPurchase" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "businessProfileId" INTEGER NOT NULL,
    "plan" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invoiceId" TEXT,
    "metadata" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BusinessSubscriptionPurchase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BusinessSubscriptionPurchase_userId_idx" ON "BusinessSubscriptionPurchase"("userId");
CREATE INDEX IF NOT EXISTS "BusinessSubscriptionPurchase_businessProfileId_idx" ON "BusinessSubscriptionPurchase"("businessProfileId");
CREATE INDEX IF NOT EXISTS "BusinessSubscriptionPurchase_status_idx" ON "BusinessSubscriptionPurchase"("status");
CREATE INDEX IF NOT EXISTS "BusinessSubscriptionPurchase_invoiceId_idx" ON "BusinessSubscriptionPurchase"("invoiceId");

ALTER TABLE "BusinessSubscriptionPurchase" DROP CONSTRAINT IF EXISTS "BusinessSubscriptionPurchase_userId_fkey";
ALTER TABLE "BusinessSubscriptionPurchase" ADD CONSTRAINT "BusinessSubscriptionPurchase_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessSubscriptionPurchase" DROP CONSTRAINT IF EXISTS "BusinessSubscriptionPurchase_businessProfileId_fkey";
ALTER TABLE "BusinessSubscriptionPurchase" ADD CONSTRAINT "BusinessSubscriptionPurchase_businessProfileId_fkey"
    FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
