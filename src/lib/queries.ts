// Consultas que alimentam o dashboard a partir do PostgreSQL (já sincronizado pelo cron).

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { PAID_STATUSES } from "./format";

export type Period = "7d" | "30d" | "90d" | "365d" | "all";

export function periodToDate(period: Period): Date | null {
  if (period === "all") return null;
  const days = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 }[period];
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Coalesce da "data efetiva" do pagamento usada nos cortes por período. */
const EFFECTIVE_DATE = Prisma.sql`COALESCE("paymentDate", "confirmedDate", "dateCreated")`;

const PAID = Prisma.sql`("status" = ANY(${PAID_STATUSES}))`;

export interface DashboardSummary {
  totalArrecadado: number;
  totalRecebidas: number;
  totalDoadores: number;
  ticketMedio: number;
  doadoresComTresRecorrentes: number;
}

export async function getSummary(since: Date | null): Promise<DashboardSummary> {
  const sinceFilter = since
    ? Prisma.sql`AND ${EFFECTIVE_DATE} >= ${since}`
    : Prisma.empty;

  const [agg] = await prisma.$queryRaw<
    { total: number; recebidas: bigint; doadores: bigint }[]
  >(Prisma.sql`
    SELECT
      COALESCE(SUM("value"), 0)::float8        AS total,
      COUNT(*)::bigint                          AS recebidas,
      COUNT(DISTINCT "customerId")::bigint      AS doadores
    FROM "payments"
    WHERE ${PAID} ${sinceFilter}
  `);

  const totalArrecadado = Number(agg?.total ?? 0);
  const totalRecebidas = Number(agg?.recebidas ?? 0);
  const totalDoadores = Number(agg?.doadores ?? 0);

  return {
    totalArrecadado,
    totalRecebidas,
    totalDoadores,
    ticketMedio: totalRecebidas > 0 ? totalArrecadado / totalRecebidas : 0,
    doadoresComTresRecorrentes: await getDonorsWithNRecurring(3),
  };
}

/**
 * Quantidade de doadores que possuem EXATAMENTE N cobranças recorrentes pagas
 * (cobranças vinculadas a uma assinatura). Use n=3 para o card pedido.
 */
export async function getDonorsWithNRecurring(n: number): Promise<number> {
  const [row] = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count FROM (
      SELECT "customerId"
      FROM "payments"
      WHERE "subscriptionId" IS NOT NULL AND ${PAID}
      GROUP BY "customerId"
      HAVING COUNT(*) = ${n}
    ) t
  `);
  return Number(row?.count ?? 0);
}

/** Lista os doadores com N cobranças recorrentes (para detalhamento). */
export async function listDonorsWithNRecurring(n: number) {
  return prisma.$queryRaw<
    { id: string; name: string | null; email: string | null; recorrentes: bigint; total: number }[]
  >(Prisma.sql`
    SELECT c."id", c."name", c."email",
           COUNT(p.*)::bigint        AS recorrentes,
           COALESCE(SUM(p."value"),0)::float8 AS total
    FROM "payments" p
    JOIN "customers" c ON c."id" = p."customerId"
    WHERE p."subscriptionId" IS NOT NULL AND (p."status" = ANY(${PAID_STATUSES}))
    GROUP BY c."id", c."name", c."email"
    HAVING COUNT(p.*) = ${n}
    ORDER BY total DESC
  `);
}

export interface TimeSeriesPoint {
  dia: string; // YYYY-MM-DD
  total: number;
}

/** Série temporal do valor arrecadado por dia, no período. */
export async function getTimeSeries(since: Date | null): Promise<TimeSeriesPoint[]> {
  const sinceFilter = since
    ? Prisma.sql`AND ${EFFECTIVE_DATE} >= ${since}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<{ dia: Date; total: number }[]>(Prisma.sql`
    SELECT date_trunc('day', ${EFFECTIVE_DATE}) AS dia,
           COALESCE(SUM("value"), 0)::float8    AS total
    FROM "payments"
    WHERE ${PAID} ${sinceFilter}
    GROUP BY 1
    ORDER BY 1 ASC
  `);

  return rows.map((r) => ({
    dia: r.dia.toISOString().slice(0, 10),
    total: Number(r.total),
  }));
}

export interface BillingBreakdown {
  billingType: string;
  total: number;
  quantidade: number;
}

/** Arrecadação por forma de pagamento (PIX, boleto, cartão...). */
export async function getBillingBreakdown(
  since: Date | null
): Promise<BillingBreakdown[]> {
  const sinceFilter = since
    ? Prisma.sql`AND ${EFFECTIVE_DATE} >= ${since}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    { billingType: string; total: number; quantidade: bigint }[]
  >(Prisma.sql`
    SELECT "billingType",
           COALESCE(SUM("value"), 0)::float8 AS total,
           COUNT(*)::bigint                   AS quantidade
    FROM "payments"
    WHERE ${PAID} ${sinceFilter}
    GROUP BY "billingType"
    ORDER BY total DESC
  `);

  return rows.map((r) => ({
    billingType: r.billingType,
    total: Number(r.total),
    quantidade: Number(r.quantidade),
  }));
}

export interface PaymentRow {
  id: string;
  value: string;
  billingType: string;
  status: string;
  description: string | null;
  paymentDate: Date | null;
  dateCreated: Date | null;
  customerName: string | null;
  customerEmail: string | null;
  isRecurring: boolean;
}

/** Lista paginada de transações/doações. */
export async function listPayments(opts: {
  page: number;
  pageSize: number;
  since: Date | null;
}): Promise<{ rows: PaymentRow[]; total: number }> {
  const { page, pageSize, since } = opts;
  const where: Prisma.PaymentWhereInput = since
    ? {
        OR: [
          { paymentDate: { gte: since } },
          { paymentDate: null, confirmedDate: { gte: since } },
          { paymentDate: null, confirmedDate: null, dateCreated: { gte: since } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: [{ paymentDate: "desc" }, { dateCreated: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { customer: { select: { name: true, email: true } } },
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    total,
    rows: rows.map((p) => ({
      id: p.id,
      value: p.value.toString(),
      billingType: p.billingType,
      status: p.status,
      description: p.description,
      paymentDate: p.paymentDate,
      dateCreated: p.dateCreated,
      customerName: p.customer?.name ?? null,
      customerEmail: p.customer?.email ?? null,
      isRecurring: p.subscriptionId != null,
    })),
  };
}

/** Última execução do cron de sincronização. */
export async function getLastSync() {
  return prisma.syncLog.findFirst({ orderBy: { startedAt: "desc" } });
}
