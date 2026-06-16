-- Migration inicial do icv-dash. Cria o schema isolado e todas as tabelas do app.

CREATE SCHEMA IF NOT EXISTS "icv_dash";

-- admin_users
CREATE TABLE "icv_dash"."admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_users_email_key" ON "icv_dash"."admin_users"("email");

-- customers
CREATE TABLE "icv_dash"."customers" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "cpfCnpj" TEXT,
    "mobilePhone" TEXT,
    "dateCreated" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "customers_email_idx" ON "icv_dash"."customers"("email");

-- subscriptions
CREATE TABLE "icv_dash"."subscriptions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT,
    "billingType" TEXT,
    "value" DECIMAL(12,2) NOT NULL,
    "cycle" TEXT,
    "description" TEXT,
    "nextDueDate" TIMESTAMP(3),
    "dateCreated" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "subscriptions_customerId_idx" ON "icv_dash"."subscriptions"("customerId");
CREATE INDEX "subscriptions_status_idx" ON "icv_dash"."subscriptions"("status");

-- payments
CREATE TABLE "icv_dash"."payments" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "value" DECIMAL(12,2) NOT NULL,
    "netValue" DECIMAL(12,2),
    "billingType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT,
    "invoiceUrl" TEXT,
    "dueDate" TIMESTAMP(3),
    "paymentDate" TIMESTAMP(3),
    "confirmedDate" TIMESTAMP(3),
    "dateCreated" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payments_customerId_idx" ON "icv_dash"."payments"("customerId");
CREATE INDEX "payments_subscriptionId_idx" ON "icv_dash"."payments"("subscriptionId");
CREATE INDEX "payments_status_idx" ON "icv_dash"."payments"("status");
CREATE INDEX "payments_billingType_idx" ON "icv_dash"."payments"("billingType");
CREATE INDEX "payments_paymentDate_idx" ON "icv_dash"."payments"("paymentDate");
CREATE INDEX "payments_dateCreated_idx" ON "icv_dash"."payments"("dateCreated");

-- sync_logs
CREATE TABLE "icv_dash"."sync_logs" (
    "id" SERIAL NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "paymentsProcessed" INTEGER NOT NULL DEFAULT 0,
    "customersProcessed" INTEGER NOT NULL DEFAULT 0,
    "subscriptionsProcessed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "icv_dash"."subscriptions"
  ADD CONSTRAINT "subscriptions_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "icv_dash"."customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "icv_dash"."payments"
  ADD CONSTRAINT "payments_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "icv_dash"."customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "icv_dash"."payments"
  ADD CONSTRAINT "payments_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "icv_dash"."subscriptions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
