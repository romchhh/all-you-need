-- AlterTable Review: reply + TradeGround contact badge
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "hadTradeGroundContact" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "ownerReply" TEXT;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "ownerRepliedAt" TIMESTAMP(3);

-- CreateTable BusinessReviewInvite
CREATE TABLE IF NOT EXISTS "BusinessReviewInvite" (
    "id" SERIAL NOT NULL,
    "viewerUserId" INTEGER NOT NULL,
    "businessUserId" INTEGER NOT NULL,
    "businessProfileId" INTEGER,
    "businessName" TEXT,
    "contactedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviteDueAt" TIMESTAMP(3) NOT NULL,
    "inviteSentAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessReviewInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BusinessReviewInvite_viewerUserId_businessUserId_key"
  ON "BusinessReviewInvite"("viewerUserId", "businessUserId");

CREATE INDEX IF NOT EXISTS "BusinessReviewInvite_status_inviteDueAt_idx"
  ON "BusinessReviewInvite"("status", "inviteDueAt");

CREATE INDEX IF NOT EXISTS "BusinessReviewInvite_businessUserId_idx"
  ON "BusinessReviewInvite"("businessUserId");
