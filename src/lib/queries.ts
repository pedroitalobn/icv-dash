// Consultas do dashboard sobre as tabelas replicadas `donations` e `donors` (schema icv_dash).

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

/// "Data efetiva" da doação usada nos cortes por período.
const EFFECTIVE_DATE = Prisma.sql`COALESCE("paid_at", "confirmed_at", "created_at")`;
const PAID = Prisma.sql`("status" = ANY(${PAID_STATUSES}))`;

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
  paymentMethod?: string | null;
  recurring?: "recurring" | "oneoff" | null;
  project?: string | null;
  q?: string | null;
}

/** WHERE da listagem de doações (aliases d. = donations, c. = donors). */
function donationsWhere(f: PaymentFilters): Prisma.Sql {
  const conds: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.since) conds.push(Prisma.sql`COALESCE(d."paid_at", d."confirmed_at", d."created_at") >= ${f.since}`);
  if (f.until) conds.push(Prisma.sql`COALESCE(d."paid_at", d."confirmed_at", d."created_at") < ${f.until}`);
  if (f.status) conds.push(Prisma.sql`d."status" = ${f.status}`);
  if (f.paymentMethod) conds.push(Prisma.sql`d."payment_method" = ${f.paymentMethod}`);
  if (f.project) conds.push(Prisma.sql`d."project" = ${f.project}`);
  if (f.recurring === "recurring") conds.push(Prisma.sql`d."is_recurring" = true`);
  if (f.recurring === "oneoff") conds.push(Prisma.sql`d."is_recurring" = false`);
  if (f.q) {
    const like = `%${f.q}%`;
    conds.push(
      Prisma.sql`(c."full_name" ILIKE ${like} OR c."email" ILIKE ${like} OR c."document_number" ILIKE ${like})`
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
      COALESCE(SUM("amount"), 0)::float8   AS total,
      COUNT(*)::bigint                      AS recebidas,
      COUNT(DISTINCT "donor_id")::bigint    AS doadores
    FROM "donations"
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

/** Doadores com EXATAMENTE N doações recorrentes pagas. */
export async function getDonorsWithNRecurring(n: number): Promise<number> {
  const [row] = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count FROM (
      SELECT "donor_id"
      FROM "donations"
      WHERE "is_recurring" = true AND ${PAID}
      GROUP BY "donor_id"
      HAVING COUNT(*) = ${n}
    ) t
  `);
  return Number(row?.count ?? 0);
}

export interface TimeSeriesPoint {
  dia: string;
  total: number;
}

export async function getTimeSeries(
  since: Date | null,
  until: Date | null = null
): Promise<TimeSeriesPoint[]> {
  const rows = await prisma.$queryRaw<{ dia: Date; total: number }[]>(Prisma.sql`
    SELECT date_trunc('day', ${EFFECTIVE_DATE}) AS dia,
           COALESCE(SUM("amount"), 0)::float8   AS total
    FROM "donations"
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

/** Arrecadação por forma de pagamento. */
export async function getPaymentMethodBreakdown(
  since: Date | null,
  until: Date | null = null
): Promise<BillingBreakdown[]> {
  const rows = await prisma.$queryRaw<
    { payment_method: string; total: number; quantidade: bigint }[]
  >(Prisma.sql`
    SELECT "payment_method",
           COALESCE(SUM("amount"), 0)::float8 AS total,
           COUNT(*)::bigint                    AS quantidade
    FROM "donations"
    WHERE ${PAID} ${dateAnd(since, until)}
    GROUP BY "payment_method"
    ORDER BY total DESC
  `);
  return rows.map((r) => ({
    billingType: r.payment_method,
    total: Number(r.total),
    quantidade: Number(r.quantidade),
  }));
}

export interface ProjectBreakdown {
  project: string;
  total: number;
  quantidade: number;
  doadores: number;
}

/** Arrecadação por projeto (Cruz da Vida / Deixai Vir a Mim). */
export async function getProjectBreakdown(
  since: Date | null,
  until: Date | null = null
): Promise<ProjectBreakdown[]> {
  const rows = await prisma.$queryRaw<
    { project: string | null; total: number; quantidade: bigint; doadores: bigint }[]
  >(Prisma.sql`
    SELECT COALESCE("project", 'Não classificado') AS project,
           COALESCE(SUM("amount"), 0)::float8       AS total,
           COUNT(*)::bigint                          AS quantidade,
           COUNT(DISTINCT "donor_id")::bigint        AS doadores
    FROM "donations"
    WHERE ${PAID} ${dateAnd(since, until)}
    GROUP BY "project"
    ORDER BY total DESC
  `);
  return rows.map((r) => ({
    project: r.project ?? "Não classificado",
    total: Number(r.total),
    quantidade: Number(r.quantidade),
    doadores: Number(r.doadores),
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
  project: string | null;
}

export async function listDonations(opts: {
  page: number;
  pageSize: number;
  filters: PaymentFilters;
}): Promise<{ rows: PaymentRow[]; total: number }> {
  const { page, pageSize, filters } = opts;
  const where = donationsWhere(filters);

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
      project: string | null;
      customerName: string | null;
      customerEmail: string | null;
    }[]
  >(Prisma.sql`
    SELECT d."id", d."amount"::text AS value, d."payment_method" AS "billingType",
           d."status", d."description",
           d."paid_at" AS "paymentDate", d."created_at" AS "dateCreated",
           d."is_recurring" AS "isRecurring", d."project",
           c."full_name" AS "customerName", c."email" AS "customerEmail"
    FROM "donations" d
    JOIN "donors" c ON c."id" = d."donor_id"
    ${where}
    ORDER BY COALESCE(d."paid_at", d."confirmed_at", d."created_at") DESC NULLS LAST
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `);

  const [cnt] = await prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS total
    FROM "donations" d
    JOIN "donors" c ON c."id" = d."donor_id"
    ${where}
  `);

  return { rows, total: Number(cnt?.total ?? 0) };
}

// ----------------------- Métricas de recorrência -----------------------------

export interface RecurringMetrics {
  mrr: number; // receita recorrente recebida no mês corrente
  activeSubs: number; // doadores recorrentes ativos (com doação recorrente nos últimos 60 dias)
  canceledSubs: number; // recorrentes inativos (sem doação recorrente nos últimos 60 dias)
}

export async function getRecurringMetrics(): Promise<RecurringMetrics> {
  const [row] = await prisma.$queryRaw<
    { mrr: number; ativos: bigint; total_rec: bigint }[]
  >(Prisma.sql`
    SELECT
      COALESCE(SUM("amount") FILTER (
        WHERE ${PAID} AND ${EFFECTIVE_DATE} >= date_trunc('month', now())
      ), 0)::float8 AS mrr,
      COUNT(DISTINCT "donor_id") FILTER (
        WHERE ${EFFECTIVE_DATE} >= now() - interval '60 days'
      )::bigint AS ativos,
      COUNT(DISTINCT "donor_id")::bigint AS total_rec
    FROM "donations"
    WHERE "is_recurring" = true
  `);
  const ativos = Number(row?.ativos ?? 0);
  const totalRec = Number(row?.total_rec ?? 0);
  return {
    mrr: Number(row?.mrr ?? 0),
    activeSubs: ativos,
    canceledSubs: Math.max(0, totalRec - ativos),
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
    Prisma.sql`COALESCE("due_date", "created_at")`
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
      COALESCE(SUM("amount") FILTER (WHERE "status" = 'overdue'), 0)::float8 AS overdue_value,
      COUNT(*) FILTER (WHERE "status" = 'overdue')::bigint                   AS overdue_count,
      COALESCE(SUM("amount") FILTER (WHERE "status" = 'pending'), 0)::float8 AS pending_value,
      COUNT(*) FILTER (WHERE "status" = 'pending')::bigint                   AS pending_count
    FROM "donations"
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
      SELECT COUNT(DISTINCT "donor_id")::bigint AS novos
      FROM "donations" WHERE ${PAID} ${dateAnd(null, until)}
    `);
    return { novos: Number(r?.novos ?? 0), recorrentes: 0 };
  }
  const upper = until ? Prisma.sql`AND ${EFFECTIVE_DATE} < ${until}` : Prisma.empty;
  const [row] = await prisma.$queryRaw<{ novos: bigint; recorrentes: bigint }[]>(
    Prisma.sql`
      WITH inperiod AS (
        SELECT DISTINCT "donor_id" AS cid
        FROM "donations"
        WHERE ${PAID} AND ${EFFECTIVE_DATE} >= ${since} ${upper}
      ),
      prior AS (
        SELECT DISTINCT "donor_id" AS cid
        FROM "donations"
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
        COALESCE(SUM("amount") FILTER (
          WHERE ${EFFECTIVE_DATE} >= date_trunc('month', now())
        ), 0)::float8 AS atual,
        COALESCE(SUM("amount") FILTER (
          WHERE ${EFFECTIVE_DATE} >= date_trunc('month', now()) - interval '1 month'
            AND ${EFFECTIVE_DATE} <  date_trunc('month', now())
        ), 0)::float8 AS anterior
      FROM "donations"
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
    SELECT c."id", c."full_name" AS name, c."email",
           COALESCE(SUM(d."amount"), 0)::float8 AS total,
           COUNT(*)::bigint                      AS quantidade
    FROM "donations" d
    JOIN "donors" c ON c."id" = d."donor_id"
    WHERE ${PAID} ${dateAnd(since, until)}
    GROUP BY c."id", c."full_name", c."email"
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

/** Doações que casam com os filtros (para exportação CSV). */
export async function exportDonations(filters: PaymentFilters) {
  const where = donationsWhere(filters);
  return prisma.$queryRaw<
    {
      id: string;
      value: string;
      netValue: string | null;
      billingType: string;
      status: string;
      isRecurring: boolean;
      project: string | null;
      paymentDate: Date | null;
      dueDate: Date | null;
      dateCreated: Date | null;
      customerName: string | null;
      customerEmail: string | null;
      documentNumber: string | null;
    }[]
  >(Prisma.sql`
    SELECT d."id", d."amount"::text AS value, d."net_amount"::text AS "netValue",
           d."payment_method" AS "billingType", d."status",
           d."is_recurring" AS "isRecurring", d."project",
           d."paid_at" AS "paymentDate", d."due_date" AS "dueDate", d."created_at" AS "dateCreated",
           c."full_name" AS "customerName", c."email" AS "customerEmail",
           c."document_number" AS "documentNumber"
    FROM "donations" d
    JOIN "donors" c ON c."id" = d."donor_id"
    ${where}
    ORDER BY COALESCE(d."paid_at", d."confirmed_at", d."created_at") DESC NULLS LAST
  `);
}

/** Última execução do cron de sincronização. */
export async function getLastSync() {
  return prisma.syncLog.findFirst({ orderBy: { startedAt: "desc" } });
}
