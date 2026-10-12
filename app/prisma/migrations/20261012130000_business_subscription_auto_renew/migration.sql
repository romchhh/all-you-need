-- BusinessProfile.subscriptionAutoRenew був у schema.prisma, але без міграції.
-- Без колонки падає кожен prisma.businessProfile.* (і GET /api/listings/[id]).
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "subscriptionAutoRenew" BOOLEAN NOT NULL DEFAULT true;
