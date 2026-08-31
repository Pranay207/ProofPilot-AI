import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

const authSubject =
  process.env.RAZORPAY_MERCHANT_AUTH_SUBJECT ||
  process.env.DEV_AUTH_SUBJECT ||
  "demo-merchant-001";
const merchantName = process.env.RAZORPAY_MERCHANT_NAME || "ProofPilot Merchant";
const merchantEmail = process.env.RAZORPAY_MERCHANT_EMAIL || null;

async function columnExists(tableName, columnName) {
  const rows = await prisma.$queryRaw`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
      AND column_name = ${columnName}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function tableExists(tableName) {
  const rows = await prisma.$queryRaw`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function addColumnIfMissing(tableName, columnName) {
  if (await columnExists(tableName, columnName)) return;
  await prisma.$executeRawUnsafe(`ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" TEXT`);
  console.log(`Added ${tableName}.${columnName}`);
}

async function getPrimaryMerchantId() {
  const existing = await prisma.$queryRawUnsafe(`SELECT "id" FROM "Merchant" ORDER BY "createdAt" NULLS LAST, "id" LIMIT 1`);
  if (existing.length) return existing[0].id;

  const id = `m_${crypto.randomUUID()}`;
  await prisma.$executeRaw`
    INSERT INTO "Merchant" ("id", "name", "email", "authSubject")
    VALUES (${id}, ${merchantName}, ${merchantEmail}, ${authSubject})
  `;
  console.log(`Created merchant ${id}`);
  return id;
}

async function main() {
  if (!(await tableExists("Merchant"))) {
    throw new Error("Merchant table does not exist yet. Run initial Prisma setup first.");
  }

  await addColumnIfMissing("Merchant", "authSubject");
  await addColumnIfMissing("PaymentSignal", "merchantId");
  await addColumnIfMissing("WebhookEvent", "merchantId");

  await prisma.$executeRaw`
    UPDATE "Merchant"
    SET "authSubject" = ${authSubject}
    WHERE "authSubject" IS NULL OR "authSubject" = ''
  `;

  const merchantId = await getPrimaryMerchantId();

  await prisma.$executeRaw`
    UPDATE "PaymentSignal"
    SET "merchantId" = ${merchantId}
    WHERE "merchantId" IS NULL OR "merchantId" = ''
  `;

  await prisma.$executeRaw`
    UPDATE "WebhookEvent"
    SET "merchantId" = ${merchantId}
    WHERE "merchantId" IS NULL OR "merchantId" = ''
  `;

  await prisma.$executeRawUnsafe(`ALTER TABLE "Merchant" ALTER COLUMN "authSubject" SET NOT NULL`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PaymentSignal" ALTER COLUMN "merchantId" SET NOT NULL`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "WebhookEvent" ALTER COLUMN "merchantId" SET NOT NULL`);

  console.log("Backfilled merchant ownership columns safely.");
  console.log("Next: run `npx prisma db push`.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
