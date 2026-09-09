-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "avatar" TEXT,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "reviewsCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "listingPackagesBalance" INTEGER NOT NULL DEFAULT 1,
    "hasUsedFreeAd" BOOLEAN NOT NULL DEFAULT false,
    "agreementAccepted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "previousPrice" TEXT,
    "priceChangedAt" TIMESTAMP(3),
    "currency" TEXT,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "condition" TEXT,
    "location" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "favoriteBoost" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending_moderation',
    "moderationStatus" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "promotionType" TEXT,
    "promotionEnds" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "images" TEXT NOT NULL,
    "optimizedImages" TEXT,
    "tags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "moderatedAt" TIMESTAMP(3),
    "moderatedBy" INTEGER,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramListing" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT DEFAULT 'EUR',
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "condition" TEXT NOT NULL,
    "location" TEXT,
    "images" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_moderation',
    "moderationStatus" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "publishedAt" TIMESTAMP(3),
    "moderatedAt" TIMESTAMP(3),
    "moderatedBy" INTEGER,
    "channelMessageId" INTEGER,
    "publicationTariff" TEXT,
    "paymentStatus" TEXT DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CitySubscription" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "cityKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CitySubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "listingId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "paymentMethod" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "description" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "amountEur" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'created',
    "pageUrl" TEXT,
    "webhookData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "targetId" INTEGER NOT NULL,
    "listingId" INTEGER,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewHistory" (
    "id" SERIAL NOT NULL,
    "listingId" INTEGER NOT NULL,
    "viewerTelegramId" BIGINT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "ViewHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "parentId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "username" TEXT,
    "addedBy" INTEGER,
    "addedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSuperadmin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" SERIAL NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventGroup" TEXT,
    "userId" INTEGER,
    "telegramId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemMonitorLog" (
    "id" SERIAL NOT NULL,
    "serviceName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "details" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemMonitorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" INTEGER,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingPackagePurchase" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "packageType" TEXT NOT NULL,
    "listingsCount" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invoiceId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ListingPackagePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionPurchase" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "listingId" INTEGER,
    "promotionType" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 7,
    "paymentMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invoiceId" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Link" (
    "id" SERIAL NOT NULL,
    "linkName" TEXT NOT NULL,
    "linkUrl" TEXT,
    "linkCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" SERIAL NOT NULL,
    "referrer_telegram_id" BIGINT NOT NULL,
    "referred_telegram_id" BIGINT NOT NULL,
    "reward_paid" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reward_paid_at" TIMESTAMP(3),

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "User_telegramId_idx" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE INDEX "Listing_userId_idx" ON "Listing"("userId");

-- CreateIndex
CREATE INDEX "Listing_category_idx" ON "Listing"("category");

-- CreateIndex
CREATE INDEX "Listing_subcategory_idx" ON "Listing"("subcategory");

-- CreateIndex
CREATE INDEX "Listing_status_idx" ON "Listing"("status");

-- CreateIndex
CREATE INDEX "Listing_moderationStatus_idx" ON "Listing"("moderationStatus");

-- CreateIndex
CREATE INDEX "Listing_isFree_idx" ON "Listing"("isFree");

-- CreateIndex
CREATE INDEX "Listing_createdAt_idx" ON "Listing"("createdAt");

-- CreateIndex
CREATE INDEX "Listing_publishedAt_idx" ON "Listing"("publishedAt");

-- CreateIndex
CREATE INDEX "Listing_currency_idx" ON "Listing"("currency");

-- CreateIndex
CREATE INDEX "Listing_views_idx" ON "Listing"("views");

-- CreateIndex
CREATE INDEX "Listing_promotionType_promotionEnds_idx" ON "Listing"("promotionType", "promotionEnds");

-- CreateIndex
CREATE INDEX "Listing_category_subcategory_status_idx" ON "Listing"("category", "subcategory", "status");

-- CreateIndex
CREATE INDEX "Listing_status_createdAt_idx" ON "Listing"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_status_views_idx" ON "Listing"("status", "views");

-- CreateIndex
CREATE INDEX "Listing_userId_status_idx" ON "Listing"("userId", "status");

-- CreateIndex
CREATE INDEX "Listing_userId_category_idx" ON "Listing"("userId", "category");

-- CreateIndex
CREATE INDEX "Listing_status_isFree_createdAt_idx" ON "Listing"("status", "isFree", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_moderationStatus_createdAt_idx" ON "Listing"("moderationStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_expiresAt_idx" ON "Listing"("expiresAt");

-- CreateIndex
CREATE INDEX "Listing_status_expiresAt_idx" ON "Listing"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Listing_condition_idx" ON "Listing"("condition");

-- CreateIndex
CREATE INDEX "Listing_status_condition_idx" ON "Listing"("status", "condition");

-- CreateIndex
CREATE INDEX "Listing_status_currency_idx" ON "Listing"("status", "currency");

-- CreateIndex
CREATE INDEX "Listing_category_status_idx" ON "Listing"("category", "status");

-- CreateIndex
CREATE INDEX "TelegramListing_userId_idx" ON "TelegramListing"("userId");

-- CreateIndex
CREATE INDEX "TelegramListing_status_idx" ON "TelegramListing"("status");

-- CreateIndex
CREATE INDEX "TelegramListing_moderationStatus_idx" ON "TelegramListing"("moderationStatus");

-- CreateIndex
CREATE INDEX "TelegramListing_createdAt_idx" ON "TelegramListing"("createdAt");

-- CreateIndex
CREATE INDEX "TelegramListing_category_idx" ON "TelegramListing"("category");

-- CreateIndex
CREATE INDEX "CitySubscription_cityKey_idx" ON "CitySubscription"("cityKey");

-- CreateIndex
CREATE UNIQUE INDEX "CitySubscription_userId_cityKey_key" ON "CitySubscription"("userId", "cityKey");

-- CreateIndex
CREATE INDEX "Favorite_userId_idx" ON "Favorite"("userId");

-- CreateIndex
CREATE INDEX "Favorite_listingId_idx" ON "Favorite"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_listingId_key" ON "Favorite"("userId", "listingId");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE INDEX "Transaction_type_status_idx" ON "Transaction"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_invoiceId_key" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "Review_targetId_idx" ON "Review"("targetId");

-- CreateIndex
CREATE INDEX "Review_listingId_idx" ON "Review"("listingId");

-- CreateIndex
CREATE INDEX "Review_createdAt_idx" ON "Review"("createdAt");

-- CreateIndex
CREATE INDEX "ViewHistory_listingId_idx" ON "ViewHistory"("listingId");

-- CreateIndex
CREATE INDEX "ViewHistory_viewerTelegramId_idx" ON "ViewHistory"("viewerTelegramId");

-- CreateIndex
CREATE INDEX "ViewHistory_viewedAt_idx" ON "ViewHistory"("viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ViewHistory_listingId_viewerTelegramId_key" ON "ViewHistory"("listingId", "viewerTelegramId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE INDEX "Category_isActive_sortOrder_idx" ON "Category"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_userId_key" ON "Admin"("userId");

-- CreateIndex
CREATE INDEX "Admin_userId_idx" ON "Admin"("userId");

-- CreateIndex
CREATE INDEX "Admin_isSuperadmin_idx" ON "Admin"("isSuperadmin");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_eventName_idx" ON "AnalyticsEvent"("eventName");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_entityType_entityId_idx" ON "AnalyticsEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "SystemMonitorLog_serviceName_idx" ON "SystemMonitorLog"("serviceName");

-- CreateIndex
CREATE INDEX "SystemMonitorLog_checkedAt_idx" ON "SystemMonitorLog"("checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSettings_key_key" ON "SystemSettings"("key");

-- CreateIndex
CREATE INDEX "SystemSettings_key_idx" ON "SystemSettings"("key");

-- CreateIndex
CREATE INDEX "ListingPackagePurchase_userId_idx" ON "ListingPackagePurchase"("userId");

-- CreateIndex
CREATE INDEX "ListingPackagePurchase_status_idx" ON "ListingPackagePurchase"("status");

-- CreateIndex
CREATE INDEX "ListingPackagePurchase_createdAt_idx" ON "ListingPackagePurchase"("createdAt");

-- CreateIndex
CREATE INDEX "ListingPackagePurchase_invoiceId_idx" ON "ListingPackagePurchase"("invoiceId");

-- CreateIndex
CREATE INDEX "PromotionPurchase_userId_idx" ON "PromotionPurchase"("userId");

-- CreateIndex
CREATE INDEX "PromotionPurchase_listingId_idx" ON "PromotionPurchase"("listingId");

-- CreateIndex
CREATE INDEX "PromotionPurchase_status_idx" ON "PromotionPurchase"("status");

-- CreateIndex
CREATE INDEX "PromotionPurchase_promotionType_idx" ON "PromotionPurchase"("promotionType");

-- CreateIndex
CREATE INDEX "PromotionPurchase_createdAt_idx" ON "PromotionPurchase"("createdAt");

-- CreateIndex
CREATE INDEX "PromotionPurchase_invoiceId_idx" ON "PromotionPurchase"("invoiceId");

-- CreateIndex
CREATE INDEX "Link_linkName_idx" ON "Link"("linkName");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referred_telegram_id_key" ON "Referral"("referred_telegram_id");

-- CreateIndex
CREATE INDEX "Referral_referrer_telegram_id_idx" ON "Referral"("referrer_telegram_id");

-- CreateIndex
CREATE INDEX "Referral_referred_telegram_id_idx" ON "Referral"("referred_telegram_id");

-- CreateIndex
CREATE INDEX "Referral_reward_paid_idx" ON "Referral"("reward_paid");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramListing" ADD CONSTRAINT "TelegramListing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitySubscription" ADD CONSTRAINT "CitySubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewHistory" ADD CONSTRAINT "ViewHistory_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingPackagePurchase" ADD CONSTRAINT "ListingPackagePurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionPurchase" ADD CONSTRAINT "PromotionPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

