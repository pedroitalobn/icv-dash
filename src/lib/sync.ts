// Sincronização Asaas → tabelas donors/donations (schema icv_dash dedicado).
// Usado pelo cron (/api/cron/sync) e pelo script scripts/sync.ts.

import { subDays } from "date-fns";
import { asaas, type AsaasCustomer, type AsaasPayment } from "./asaas";
import { prisma } from "./prisma";
import { donorDedupeKey } from "./donor-key";
import { mapAsaasBillingType, mapAsaasStatus } from "./format";

// Conta do Asaas que a API key representa (cron = ICV).
const API_PROJECT = process.env.ASAAS_PROJECT ?? "Cruz da Vida";
const API_SOURCE = "Asaas API";

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Upsert do doador a partir de um cliente do Asaas. Retorna o id interno. */
async function upsertDonor(c: {
  externalId?: string | null;
  name?: string | null;
  email?: string | null;
  documentNumber?: string | null;
  mobilePhone?: string | null;
  dateCreated?: string | null;
}): Promise<string> {
  const dedupeKey = donorDedupeKey({
    documentNumber: c.documentNumber,
    email: c.email,
    externalId: c.externalId,
    name: c.name,
  });
  const data = {
    fullName: c.name?.trim() || "(sem nome)",
    email: c.email?.trim() || null,
    documentNumber: c.documentNumber?.replace(/\D/g, "") || null,
    mobilePhone: c.mobilePhone?.trim() || null,
    project: API_PROJECT,
    source: API_SOURCE,
  };
  const donor = await prisma.donor.upsert({
    where: { dedupeKey },
    create: { dedupeKey, ...data },
    update: data,
    select: { id: true },
  });
  return donor.id;
}

async function upsertDonation(p: AsaasPayment, donorId: string) {
  const isRecurring = Boolean(p.subscription);
  const createData = {
    donorId,
    externalId: p.id,
    amount: p.value,
    netAmount: p.netValue,
    paymentMethod: mapAsaasBillingType(p.billingType),
    status: mapAsaasStatus(p.status),
    statusRaw: p.status,
    paymentMethodRaw: p.billingType,
    chargeTypeRaw: isRecurring ? "recurring" : "one-off",
    isRecurring,
    project: API_PROJECT,
    source: API_SOURCE,
    description: p.description,
    invoiceUrl: p.invoiceUrl,
    dueDate: toDate(p.dueDate),
    paidAt: toDate(p.paymentDate),
    confirmedAt: toDate(p.confirmedDate),
    createdAt: toDate(p.dateCreated) ?? new Date(),
  };
  // Em update não mexemos em createdAt (preserva a data de criação original).
  const { createdAt, ...updateData } = createData;
  await prisma.donation.upsert({
    where: { externalId: p.id },
    create: createData,
    update: updateData,
  });
}

/** Ingestão de uma única cobrança do Asaas (usado pelo webhook). */
export async function ingestAsaasPayment(p: AsaasPayment): Promise<void> {
  const c = await asaas.getCustomer(p.customer).catch(() => null);
  const donorId = await upsertDonor({
    externalId: p.customer,
    name: c?.name,
    email: c?.email,
    documentNumber: c?.cpfCnpj,
    mobilePhone: c?.mobilePhone,
  });
  await upsertDonation(p, donorId);
}

export interface SyncResult {
  donationsProcessed: number;
  donorsProcessed: number;
  durationMs: number;
}

export async function runSync(options?: {
  lookbackDays?: number;
  full?: boolean;
}): Promise<SyncResult> {
  const lookbackDays =
    options?.lookbackDays ?? Number(process.env.SYNC_LOOKBACK_DAYS ?? "35") ?? 35;

  const log = await prisma.syncLog.create({ data: { status: "running" } });
  const startedAt = Date.now();

  let donorsProcessed = 0;
  let donationsProcessed = 0;
  // Mapa: id do cliente no Asaas → id interno do doador.
  const asaasIdToDonor = new Map<string, string>();

  try {
    // 1) Doadores (clientes do Asaas).
    await asaas.listCustomers(async (items: AsaasCustomer[]) => {
      for (const c of items) {
        const donorId = await upsertDonor({
          externalId: c.id,
          name: c.name,
          email: c.email,
          documentNumber: c.cpfCnpj,
          mobilePhone: c.mobilePhone,
          dateCreated: c.dateCreated,
        });
        asaasIdToDonor.set(c.id, donorId);
        donorsProcessed++;
      }
    });

    // 2) Doações (cobranças). Por padrão é incremental — NÃO faz backfill do
    // histórico (a carga inicial vem da importação das planilhas). Backfill só
    // sob demanda: options.full ou env SYNC_FULL=true.
    const fullBackfill = options?.full || process.env.SYNC_FULL === "true";
    const dateCreatedGe = fullBackfill
      ? undefined
      : subDays(new Date(), lookbackDays).toISOString().slice(0, 10);
    console.log(
      fullBackfill
        ? "[sync] backfill completo do histórico do Asaas"
        : `[sync] incremental (últimos ${lookbackDays} dias)`
    );

    await asaas.listPayments(dateCreatedGe, async (items: AsaasPayment[]) => {
      for (const p of items) {
        let donorId = asaasIdToDonor.get(p.customer);
        if (!donorId) {
          // Cliente não veio na listagem — busca individual e cria o doador.
          const c = await asaas.getCustomer(p.customer).catch(() => null);
          donorId = await upsertDonor({
            externalId: p.customer,
            name: c?.name,
            email: c?.email,
            documentNumber: c?.cpfCnpj,
            mobilePhone: c?.mobilePhone,
          });
          asaasIdToDonor.set(p.customer, donorId);
          donorsProcessed++;
        }
        await upsertDonation(p, donorId);
        donationsProcessed++;
      }
    });

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        donorsProcessed,
        donationsProcessed,
      },
    });
    return { donorsProcessed, donationsProcessed, durationMs: Date.now() - startedAt };
  } catch (err) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "error",
        finishedAt: new Date(),
        donorsProcessed,
        donationsProcessed,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}
