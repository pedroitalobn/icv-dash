// Consultas que alimentam o dashboard a partir do PostgreSQL (já sincronizado pelo cron).

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { PAID_STATUSES } from "./format";

export type Period = "7d" | "30d" | "90d" | "365d" | "all" | "custom";

export function periodToDate(period: Period): Date | null {
  if (period === "all" || period === "custom") return null;
  const days = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 }[period];
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Coalesce da "data efetiva" do pagamento usada nos cortes por período. */
const EFFECTIVE_DATE = Prisma.sql`COALESCE("paymentDate", "confirmedDate", "dateCreated")`;

const PAID = Prisma.sql`("status" = ANY(${PAID_STATUSES}))`;

/** Fragmento `AND <expr> >= from AND <expr> < until` (partes opcionais). */
function dateAnd(
  since: Date | null,
  until: Date | null,
  expr: Prisma.Sql = EFFECTIVE_DATE
): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (since) parts.push(Prisma.sql`${expr} >= ${since}`);
  if (until) parts.push(Prisma.sql`${expr} < ${until}`);
  if (parts.length === 0) return Prisma.empty;
  return Prisma.sql`AND ${Prisma.join(parts, " AND ")}`;
}

// --------------------------- Filtros da lista/export -------------------------

export interface PaymentFilters {
  since: Date | null;
  until: Date | null;
  status?: string | null;
  billingType?: string | null;
  recurring?: "recurring" | "oneoff" | null;
  q?: string | null;
}

/** Monta o WHERE da listagem de cobranças a partir dos filtros (aliases p./c.). */
function paymentsWhere(f: PaymentFilters): Prisma.Sql {
  const conds: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.since) conds.push(Prisma.sql`${EFFECTIVE_DATE} >= ${f.since}`);
  if (f.until) conds.push(Prisma.sql`${EFFECTIVE_DATE} < ${f.until}`);
  if (f.status) conds.push(Prisma.sql`p."status" = ${f.status}`);
  if (f.billingType) conds.push(Prisma.sql`p."billingType" = ${f.billingType}`);
  if (f.recurring === "recurring")
    conds.push(Prisma.sql`p."subscriptionId" IS NOT NULL`);
  if (f.recurring === "oneoff")
    conds.push(Prisma.sql`p."subscriptionId" IS NULL`);
  if (f.q) {
    const like = `%${f.q}%`;
    conds.push(
      Prisma.sql`(c."name" ILIKE ${like} OR c."email" ILIKE ${like} OR c."cpfCnpj" ILIKE ${like})`
    );
  }
  return Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`;
}

// --------------------------------- Resumo ------------------------------------

export interface DashboardSummary {
  totalArrecadado: number;
  totalRecebidas: number;
  totalDoadores: number;
  ticketMedio: number;
  doadoresComTresRecorrentes: number;
}

export async function getSummary(
  since: Date | null,
  until: Date | null = null
): Promise<DashboardSummary> {
  const [agg] = await prisma.$queryRaw<
    { total: number; recebidas: bigint; doadores: bigint }[]
  >(Prisma.sql`
    SELECT
      COALESCE(SUM("value"), 0)::float8        AS total,
      COUNT(*)::bigint                          AS recebidas,
      COUNT(DISTINCT "customerId")::bigint      AS doadores
    FROM "payments"
    WHERE ${PAID} ${dateAnd(since, until)}
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

export interface TimeSeriesPoint {
  dia: string; // YYYY-MM-DD
  total: number;
}

/** Série temporal do valor arrecadado por dia, no período. */
export async function getTimeSeries(
  since: Date | null,
  until: Date | null = null
): Promise<TimeSeriesPoint[]> {
  const rows = await prisma.$queryRaw<{ dia: Date; total: number }[]>(Prisma.sql`
    SELECT date_trunc('day', ${EFFECTIVE_DATE}) AS dia,
           COALESCE(SUM("value"), 0)::float8    AS total
    FROM "payments"
    WHERE ${PAID} ${dateAnd(since, until)}
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
  since: Date | null,
  until: Date | null = null
): Promise<BillingBreakdown[]> {
  const rows = await prisma.$queryRaw<
    { billingType: string; total: number; quantidade: bigint }[]
  >(Prisma.sql`
    SELECT "billingType",
           COALESCE(SUM("value"), 0)::float8 AS total,
           COUNT(*)::bigint                   AS quantidade
    FROM "payments"
    WHERE ${PAID} ${dateAnd(since, until)}
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

/** Lista paginada de transações/doações, com filtros. */
export async function listPayments(opts: {
  page: number;
  pageSize: number;
  filters: PaymentFilters;
}): Promise<{ rows: PaymentRow[]; total: number }> {
  const { page, pageSize, filters } = opts;
  const where = paymentsWhere(filters);

  const rows = await prisma.$queryRaw<
    {
      id: string;
      value: string;
      billingType: string;
      status: string;
      description: string | null;
      paymentDate: Date | null;
      dateCreated: Date | null;
      isRecurring: boolean;
      customerName: string | null;
      customerEmail: string | null;
    }[]
  >(Prisma.sql`
    SELECT p."id", p."value"::text AS value, p."billingType", p."status",
           p."description", p."paymentDate", p."dateCreated",
           (p."subscriptionId" IS NOT NULL) AS "isRecurring",
           c."name" AS "customerName", c."email" AS "customerEmail"
    FROM "payments" p
    JOIN "customers" c ON c."id" = p."customerId"
    ${where}
    ORDER BY COALESCE(p."paymentDate", p."dateCreated") DESC NULLS LAST
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `);

  const [cnt] = await prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS total
    FROM "payments" p
    JOIN "customers" c ON c."id" = p."customerId"
    ${where}
  `);

  return { rows, total: Number(cnt?.total ?? 0) };
}

// ----------------------- Métricas de recorrência (MRR) -----------------------

export interface RecurringMetrics {
  mrr: number;
  activeSubs: number;
  canceledSubs: number;
}

export async function getRecurringMetrics(): Promise<RecurringMetrics> {
  const [row] = await prisma.$queryRaw<
    { mrr: number; ativos: bigint; cancelados: bigint }[]
  >(Prisma.sql`
    SELECT
      COALESCE(SUM(
        CASE upper(COALESCE("cycle", 'MONTHLY'))
          WHEN 'WEEKLY'       THEN "value" * 4.3333
          WHEN 'BIWEEKLY'     THEN "value" * 2.1667
          WHEN 'MONTHLY'      THEN "value"
          WHEN 'BIMONTHLY'    THEN "value" / 2
          WHEN 'QUARTERLY'    THEN "value" / 3
          WHEN 'SEMIANNUALLY' THEN "value" / 6
          WHEN 'YEARLY'       THEN "value" / 12
          ELSE "value"
        END
      ) FILTER (WHERE upper(COALESCE("status",'')) = 'ACTIVE'), 0)::float8 AS mrr,
      COUNT(*) FILTER (WHERE upper(COALESCE("status",'')) = 'ACTIVE')::bigint AS ativos,
      COUNT(*) FILTER (WHERE upper(COALESCE("status",'')) <> 'ACTIVE')::bigint AS cancelados
    FROM "subscriptions"
  `);
  return {
    mrr: Number(row?.mrr ?? 0),
    activeSubs: Number(row?.ativos ?? 0),
    canceledSubs: Number(row?.cancelados ?? 0),
  };
}

// ------------------------- Inadimplência / a receber -------------------------

export interface Receivables {
  overdueValue: number;
  overdueCount: number;
  pendingValue: number;
  pendingCount: number;
}

export async function getReceivables(
  since: Date | null,
  until: Date | null = null
): Promise<Receivables> {
  const dateFilter = dateAnd(
    since,
    until,
    Prisma.sql`COALESCE("dueDate", "dateCreated")`
  );

  const [row] = await prisma.$queryRaw<
    {
      overdue_value: number;
      overdue_count: bigint;
      pending_value: number;
      pending_count: bigint;
    }[]
  >(Prisma.sql`
    SELECT
      COALESCE(SUM("value") FILTER (WHERE "status" = 'OVERDUE'), 0)::float8 AS overdue_value,
      COUNT(*) FILTER (WHERE "status" = 'OVERDUE')::bigint                  AS overdue_count,
      COALESCE(SUM("value") FILTER (WHERE "status" = 'PENDING'), 0)::float8 AS pending_value,
      COUNT(*) FILTER (WHERE "status" = 'PENDING')::bigint                  AS pending_count
    FROM "payments"
    WHERE TRUE ${dateFilter}
  `);
  return {
    overdueValue: Number(row?.overdue_value ?? 0),
    overdueCount: Number(row?.overdue_count ?? 0),
    pendingValue: Number(row?.pending_value ?? 0),
    pendingCount: Number(row?.pending_count ?? 0),
  };
}

// ------------------------ Novos vs. recorrentes / MoM ------------------------

export interface NewVsReturning {
  novos: number;
  recorrentes: number;
}

export async function getNewVsReturning(
  since: Date | null,
  until: Date | null = null
): Promise<NewVsReturning> {
  if (!since) {
    const [r] = await prisma.$queryRaw<{ novos: bigint }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT "customerId")::bigint AS novos
      FROM "payments" WHERE ${PAID} ${dateAnd(null, until)}
    `);
    return { novos: Number(r?.novos ?? 0), recorrentes: 0 };
  }

  const upper = until ? Prisma.sql`AND ${EFFECTIVE_DATE} < ${until}` : Prisma.empty;
  const [row] = await prisma.$queryRaw<{ novos: bigint; recorrentes: bigint }[]>(
    Prisma.sql`
      WITH inperiod AS (
        SELECT DISTINCT "customerId" AS cid
        FROM "payments"
        WHERE ${PAID} AND ${EFFECTIVE_DATE} >= ${since} ${upper}
      ),
      prior AS (
        SELECT DISTINCT "customerId" AS cid
        FROM "payments"
        WHERE ${PAID} AND ${EFFECTIVE_DATE} < ${since}
      )
      SELECT
        COUNT(*) FILTER (WHERE p.cid IS NULL)::bigint     AS novos,
        COUNT(*) FILTER (WHERE p.cid IS NOT NULL)::bigint AS recorrentes
      FROM inperiod i
      LEFT JOIN prior p ON p.cid = i.cid
    `
  );
  return {
    novos: Number(row?.novos ?? 0),
    recorrentes: Number(row?.recorrentes ?? 0),
  };
}

export interface MonthOverMonth {
  atual: number;
  anterior: number;
  variacaoPct: number | null;
}

export async function getMonthOverMonth(): Promise<MonthOverMonth> {
  const [row] = await prisma.$queryRaw<{ atual: number; anterior: number }[]>(
    Prisma.sql`
      SELECT
        COALESCE(SUM("value") FILTER (
          WHERE ${EFFECTIVE_DATE} >= date_trunc('month', now())
        ), 0)::float8 AS atual,
        COALESCE(SUM("value") FILTER (
          WHERE ${EFFECTIVE_DATE} >= date_trunc('month', now()) - interval '1 month'
            AND ${EFFECTIVE_DATE} <  date_trunc('month', now())
        ), 0)::float8 AS anterior
      FROM "payments"
      WHERE ${PAID}
    `
  );
  const atual = Number(row?.atual ?? 0);
  const anterior = Number(row?.anterior ?? 0);
  return {
    atual,
    anterior,
    variacaoPct: anterior > 0 ? ((atual - anterior) / anterior) * 100 : null,
  };
}

// -------------------------------- Top doadores -------------------------------

export interface TopDonor {
  id: string;
  name: string | null;
  email: string | null;
  total: number;
  quantidade: number;
}

export async function getTopDonors(
  since: Date | null,
  until: Date | null = null,
  limit = 10
): Promise<TopDonor[]> {
  const rows = await prisma.$queryRaw<
    { id: string; name: string | null; email: string | null; total: number; quantidade: bigint }[]
  >(Prisma.sql`
    SELECT c."id", c."name", c."email",
           COALESCE(SUM(p."value"), 0)::float8 AS total,
           COUNT(*)::bigint                     AS quantidade
    FROM "payments" p
    JOIN "customers" c ON c."id" = p."customerId"
    WHERE ${PAID} ${dateAnd(since, until)}
    GROUP BY c."id", c."name", c."email"
    ORDER BY total DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    total: Number(r.total),
    quantidade: Number(r.quantidade),
  }));
}

/** Todas as transações que casam com os filtros (para exportação CSV). */
export async function exportPayments(filters: PaymentFilters) {
  const where = paymentsWhere(filters);
  return prisma.$queryRaw<
    {
      id: string;
      value: string;
      netValue: string | null;
      billingType: string;
      status: string;
      isRecurring: boolean;
      paymentDate: Date | null;
      dueDate: Date | null;
      dateCreated: Date | null;
      customerName: string | null;
      customerEmail: string | null;
      cpfCnpj: string | null;
    }[]
  >(Prisma.sql`
    SELECT p."id", p."value"::text AS value, p."netValue"::text AS "netValue",
           p."billingType", p."status",
           (p."subscriptionId" IS NOT NULL) AS "isRecurring",
           p."paymentDate", p."dueDate", p."dateCreated",
           c."name" AS "customerName", c."email" AS "customerEmail", c."cpfCnpj"
    FROM "payments" p
    JOIN "customers" c ON c."id" = p."customerId"
    ${where}
    ORDER BY COALESCE(p."paymentDate", p."dateCreated") DESC NULLS LAST
  `);
}

/** Última execução do cron de sincronização. */
export async function getLastSync() {
  return prisma.syncLog.findFirst({ orderBy: { startedAt: "desc" } });
}
