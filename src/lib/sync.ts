// Lógica de sincronização: consome a API do Asaas e alimenta o PostgreSQL.
// Chamada pelo cron job (endpoint /api/cron/sync) e pelo script scripts/sync.ts.

import { subDays } from "date-fns";
import {
  asaas,
  type AsaasCustomer,
  type AsaasPayment,
  type AsaasSubscription,
} from "./asaas";
import { prisma } from "./prisma";

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function upsertCustomers(items: AsaasCustomer[]) {
  await prisma.$transaction(
    items.map((c) =>
      prisma.customer.upsert({
        where: { id: c.id },
        create: {
          id: c.id,
          name: c.name,
          email: c.email,
          cpfCnpj: c.cpfCnpj,
          mobilePhone: c.mobilePhone,
          dateCreated: toDate(c.dateCreated),
        },
        update: {
          name: c.name,
          email: c.email,
          cpfCnpj: c.cpfCnpj,
          mobilePhone: c.mobilePhone,
          dateCreated: toDate(c.dateCreated),
        },
      })
    )
  );
}

async function upsertSubscriptions(items: AsaasSubscription[]) {
  // Garante que o cliente exista antes de criar a assinatura (FK).
  for (const s of items) {
    await prisma.customer.upsert({
      where: { id: s.customer },
      create: { id: s.customer },
      update: {},
    });
  }
  await prisma.$transaction(
    items.map((s) =>
      prisma.subscription.upsert({
        where: { id: s.id },
        create: {
          id: s.id,
          customerId: s.customer,
          status: s.status,
          billingType: s.billingType,
          value: s.value,
          cycle: s.cycle,
          description: s.description,
          nextDueDate: toDate(s.nextDueDate),
          dateCreated: toDate(s.dateCreated),
        },
        update: {
          status: s.status,
          billingType: s.billingType,
          value: s.value,
          cycle: s.cycle,
          description: s.description,
          nextDueDate: toDate(s.nextDueDate),
          dateCreated: toDate(s.dateCreated),
        },
      })
    )
  );
}

async function upsertPayments(items: AsaasPayment[]) {
  // Garante o cliente (FK). A assinatura, se existir, já foi sincronizada antes.
  for (const p of items) {
    await prisma.customer.upsert({
      where: { id: p.customer },
      create: { id: p.customer },
      update: {},
    });
  }

  const knownSubs = new Set(
    (
      await prisma.subscription.findMany({
        where: {
          id: {
            in: items
              .map((p) => p.subscription)
              .filter((s): s is string => Boolean(s)),
          },
        },
        select: { id: true },
      })
    ).map((s) => s.id)
  );

  await prisma.$transaction(
    items.map((p) => {
      // Só vincula a assinatura se ela já existir no banco (respeita a FK).
      const subscriptionId =
        p.subscription && knownSubs.has(p.subscription)
          ? p.subscription
          : null;
      const data = {
        customerId: p.customer,
        subscriptionId,
        value: p.value,
        netValue: p.netValue,
        billingType: p.billingType,
        status: p.status,
        description: p.description,
        invoiceUrl: p.invoiceUrl,
        dueDate: toDate(p.dueDate),
        paymentDate: toDate(p.paymentDate),
        confirmedDate: toDate(p.confirmedDate),
        dateCreated: toDate(p.dateCreated),
        syncedAt: new Date(),
      };
      return prisma.payment.upsert({
        where: { id: p.id },
        create: { id: p.id, ...data },
        update: data,
      });
    })
  );
}

export interface SyncResult {
  paymentsProcessed: number;
  customersProcessed: number;
  subscriptionsProcessed: number;
  durationMs: number;
}

/**
 * Executa a sincronização completa:
 *  1. clientes  2. assinaturas (recorrentes)  3. cobranças.
 *
 * Backfill automático: se a tabela de cobranças estiver vazia (primeira execução),
 * puxa TODO o histórico do Asaas. Depois disso, busca apenas os últimos
 * `lookbackDays` dias (sincronização incremental). Use `options.full` para forçar
 * um backfill completo manualmente.
 */
export async function runSync(options?: {
  lookbackDays?: number;
  full?: boolean;
}): Promise<SyncResult> {
  const lookbackDays =
    options?.lookbackDays ??
    Number(process.env.SYNC_LOOKBACK_DAYS ?? "35") ??
    35;

  const log = await prisma.syncLog.create({ data: { status: "running" } });
  const startedAt = Date.now();

  let customersProcessed = 0;
  let subscriptionsProcessed = 0;
  let paymentsProcessed = 0;

  try {
    customersProcessed = await asaas.listCustomers(upsertCustomers);
    subscriptionsProcessed = await asaas.listSubscriptions(upsertSubscriptions);

    // Primeira execução (banco vazio) → backfill completo de todo o histórico.
    const existingPayments = await prisma.payment.count();
    const fullBackfill = options?.full || existingPayments === 0;
    const dateCreatedGe = fullBackfill
      ? undefined // sem filtro de data → Asaas devolve todo o histórico
      : subDays(new Date(), lookbackDays).toISOString().slice(0, 10);

    console.log(
      fullBackfill
        ? "[sync] backfill completo (histórico inteiro do Asaas)"
        : `[sync] incremental (últimos ${lookbackDays} dias)`
    );
    paymentsProcessed = await asaas.listPayments(dateCreatedGe, upsertPayments);

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        customersProcessed,
        subscriptionsProcessed,
        paymentsProcessed,
      },
    });

    return {
      customersProcessed,
      subscriptionsProcessed,
      paymentsProcessed,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "error",
        finishedAt: new Date(),
        customersProcessed,
        subscriptionsProcessed,
        paymentsProcessed,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}
