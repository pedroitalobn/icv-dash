// Consultas do dashboard sobre as tabelas replicadas `donations` e `donors` (schema icv_dash).

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  PAID_STATUSES,
  formatBRL,
  formatDate,
  maskName,
  statusLabel,
  paymentMethodLabel,
} from "./format";
import { type Period, periodToDate, type PaymentFilters } from "./periods";

// Re-export para quem já importava daqui.
export { periodToDate };
export type { Period, PaymentFilters };

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

// --- Condições de filtro (colunas não-qualificadas; tabela única "donations") ---

/** Status: usa o filtro escolhido; senão, considera recebidas/confirmadas. */
function pPaid(f: PaymentFilters): Prisma.Sql {
  return f.status ? Prisma.sql`("status" = ${f.status})` : PAID;
}
/** Projeto + forma de pagamento + origem (importado x conta Asaas). */
function pScope(f: PaymentFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (f.project) parts.push(Prisma.sql`"project" = ${f.project}`);
  if (f.paymentMethod) parts.push(Prisma.sql`"payment_method" = ${f.paymentMethod}`);
  if (f.origin === "import") parts.push(Prisma.sql`"imported_at" IS NOT NULL`);
  if (f.origin === "asaas") parts.push(Prisma.sql`"imported_at" IS NULL`);
  if (parts.length === 0) return Prisma.empty;
  return Prisma.sql`AND ${Prisma.join(parts, " AND ")}`;
}
/** Recorrência. */
function pRecur(f: PaymentFilters): Prisma.Sql {
  if (f.recurring === "recurring") return Prisma.sql`AND "is_recurring" = true`;
  if (f.recurring === "oneoff") return Prisma.sql`AND "is_recurring" = false`;
  return Prisma.empty;
}

// --------------------------- Filtros da lista/export -------------------------

/** WHERE da listagem de doações (aliases d. = donations, c. = donors). */
function donationsWhere(f: PaymentFilters): Prisma.Sql {
  const conds: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.since) conds.push(Prisma.sql`COALESCE(d."paid_at", d."confirmed_at", d."created_at") >= ${f.since}`);
  if (f.until) conds.push(Prisma.sql`COALESCE(d."paid_at", d."confirmed_at", d."created_at") < ${f.until}`);
  if (f.status) conds.push(Prisma.sql`d."status" = ${f.status}`);
  if (f.paymentMethod) conds.push(Prisma.sql`d."payment_method" = ${f.paymentMethod}`);
  if (f.project) conds.push(Prisma.sql`d."project" = ${f.project}`);
  if (f.origin === "import") conds.push(Prisma.sql`d."imported_at" IS NOT NULL`);
  if (f.origin === "asaas") conds.push(Prisma.sql`d."imported_at" IS NULL`);
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

export async function getSummary(f: PaymentFilters): Promise<DashboardSummary> {
  const [agg] = await prisma.$queryRaw<
    { total: number; recebidas: bigint; doadores: bigint }[]
  >(Prisma.sql`
    SELECT
      COALESCE(SUM("amount"), 0)::float8   AS total,
      COUNT(*)::bigint                      AS recebidas,
      COUNT(DISTINCT "donor_id")::bigint    AS doadores
    FROM "donations"
    WHERE ${pPaid(f)} ${dateAnd(f.since, f.until)} ${pScope(f)} ${pRecur(f)}
  `);

  const totalArrecadado = Number(agg?.total ?? 0);
  const totalRecebidas = Number(agg?.recebidas ?? 0);
  const totalDoadores = Number(agg?.doadores ?? 0);

  return {
    totalArrecadado,
    totalRecebidas,
    totalDoadores,
    ticketMedio: totalRecebidas > 0 ? totalArrecadado / totalRecebidas : 0,
    doadoresComTresRecorrentes: await getDonorsWithNRecurring(3, f),
  };
}

/** Doadores com EXATAMENTE N doações recorrentes pagas (respeita projeto/forma). */
export async function getDonorsWithNRecurring(
  n: number,
  f?: PaymentFilters
): Promise<number> {
  const scope = f ? pScope(f) : Prisma.empty;
  const [row] = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count FROM (
      SELECT "donor_id"
      FROM "donations"
      WHERE "is_recurring" = true AND ${PAID} ${scope}
      GROUP BY "donor_id"
      HAVING COUNT(*) = ${n}
    ) t
  `);
  return Number(row?.count ?? 0);
}

export interface RecurringDonor {
  id: string;
  name: string | null;
  email: string | null;
  documentNumber: string | null;
  mobilePhone: string | null;
  project: string | null;
  recorrentes: number;
  total: number;
}

/** Lista os doadores com EXATAMENTE N doações recorrentes pagas (respeita projeto/forma). */
export async function listDonorsWithNRecurring(
  n: number,
  f: PaymentFilters
): Promise<RecurringDonor[]> {
  const scope: Prisma.Sql[] = [];
  if (f.project) scope.push(Prisma.sql`d."project" = ${f.project}`);
  if (f.paymentMethod) scope.push(Prisma.sql`d."payment_method" = ${f.paymentMethod}`);
  const scopeSql = scope.length ? Prisma.sql`AND ${Prisma.join(scope, " AND ")}` : Prisma.empty;

  const rows = await prisma.$queryRaw<
    {
      id: string;
      name: string | null;
      email: string | null;
      document_number: string | null;
      mobile_phone: string | null;
      project: string | null;
      recorrentes: bigint;
      total: number;
    }[]
  >(Prisma.sql`
    SELECT c."id", c."full_name" AS name, c."email",
           c."document_number", c."mobile_phone", d."project",
           COUNT(d.*)::bigint                    AS recorrentes,
           COALESCE(SUM(d."amount"), 0)::float8  AS total
    FROM "donations" d
    JOIN "donors" c ON c."id" = d."donor_id"
    WHERE d."is_recurring" = true AND d."status" = ANY(${PAID_STATUSES}) ${scopeSql}
    GROUP BY c."id", c."full_name", c."email", c."document_number", c."mobile_phone", d."project"
    HAVING COUNT(d.*) = ${n}
    ORDER BY total DESC
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    documentNumber: r.document_number,
    mobilePhone: r.mobile_phone,
    project: r.project,
    recorrentes: Number(r.recorrentes),
    total: Number(r.total),
  }));
}

export interface TimeSeriesPoint {
  dia: string;
  total: number;
}

export async function getTimeSeries(f: PaymentFilters): Promise<TimeSeriesPoint[]> {
  const rows = await prisma.$queryRaw<{ dia: Date; total: number }[]>(Prisma.sql`
    SELECT date_trunc('day', ${EFFECTIVE_DATE}) AS dia,
           COALESCE(SUM("amount"), 0)::float8   AS total
    FROM "donations"
    WHERE ${pPaid(f)} ${dateAnd(f.since, f.until)} ${pScope(f)} ${pRecur(f)}
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

export async function getPaymentMethodBreakdown(
  f: PaymentFilters
): Promise<BillingBreakdown[]> {
  const rows = await prisma.$queryRaw<
    { payment_method: string; total: number; quantidade: bigint }[]
  >(Prisma.sql`
    SELECT "payment_method",
           COALESCE(SUM("amount"), 0)::float8 AS total,
           COUNT(*)::bigint                    AS quantidade
    FROM "donations"
    WHERE ${pPaid(f)} ${dateAnd(f.since, f.until)} ${pScope(f)} ${pRecur(f)}
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

export async function getProjectBreakdown(
  f: PaymentFilters
): Promise<ProjectBreakdown[]> {
  const rows = await prisma.$queryRaw<
    { project: string | null; total: number; quantidade: bigint; doadores: bigint }[]
  >(Prisma.sql`
    SELECT COALESCE("project", 'Não classificado') AS project,
           COALESCE(SUM("amount"), 0)::float8       AS total,
           COUNT(*)::bigint                          AS quantidade,
           COUNT(DISTINCT "donor_id")::bigint        AS doadores
    FROM "donations"
    WHERE ${pPaid(f)} ${dateAnd(f.since, f.until)} ${pScope(f)} ${pRecur(f)}
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
  isImported: boolean;
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
      isImported: boolean;
      customerName: string | null;
      customerEmail: string | null;
    }[]
  >(Prisma.sql`
    SELECT d."id", d."amount"::text AS value, d."payment_method" AS "billingType",
           d."status", d."description",
           d."paid_at" AS "paymentDate", d."created_at" AS "dateCreated",
           d."is_recurring" AS "isRecurring", d."project",
           (d."imported_at" IS NOT NULL) AS "isImported",
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
  mrr: number;
  activeSubs: number;
  canceledSubs: number;
}

export async function getRecurringMetrics(f: PaymentFilters): Promise<RecurringMetrics> {
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
    WHERE "is_recurring" = true ${pScope(f)}
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

export async function getReceivables(f: PaymentFilters): Promise<Receivables> {
  // Posição ATUAL (não usa o corte de período): vencida = vencimento < hoje e
  // ainda não quitada (independente do status literal); a receber = pendente
  // com vencimento futuro/sem data.
  const [row] = await prisma.$queryRaw<
    {
      overdue_value: number;
      overdue_count: bigint;
      pending_value: number;
      pending_count: bigint;
    }[]
  >(Prisma.sql`
    SELECT
      COALESCE(SUM("amount") FILTER (WHERE "due_date" < CURRENT_DATE), 0)::float8 AS overdue_value,
      COUNT(*) FILTER (WHERE "due_date" < CURRENT_DATE)::bigint                   AS overdue_count,
      COALESCE(SUM("amount") FILTER (WHERE "due_date" >= CURRENT_DATE OR "due_date" IS NULL), 0)::float8 AS pending_value,
      COUNT(*) FILTER (WHERE "due_date" >= CURRENT_DATE OR "due_date" IS NULL)::bigint AS pending_count
    FROM "donations"
    WHERE "status" NOT IN ('paid', 'confirmed', 'refunded', 'cancelled', 'chargeback')
      ${pScope(f)} ${pRecur(f)}
  `);
  return {
    overdueValue: Number(row?.overdue_value ?? 0),
    overdueCount: Number(row?.overdue_count ?? 0),
    pendingValue: Number(row?.pending_value ?? 0),
    pendingCount: Number(row?.pending_count ?? 0),
  };
}

export interface OverdueMrr {
  value: number; // receita mensal recorrente em atraso (1 valor por doador)
  count: number; // doadores recorrentes com cobrança vencida
}

/**
 * Inadimplência da recorrência (MRR), SEM o acumulado: para cada doador
 * recorrente com cobrança vencida, considera apenas UM valor mensal (a parcela
 * vencida mais recente) — representa quanto de receita mensal está em atraso.
 */
export async function getOverdueMrr(f: PaymentFilters): Promise<OverdueMrr> {
  const [row] = await prisma.$queryRaw<{ value: number; count: bigint }[]>(Prisma.sql`
    SELECT COALESCE(SUM(t.monthly), 0)::float8 AS value,
           COUNT(*)::bigint                     AS count
    FROM (
      SELECT "donor_id",
             (array_agg("amount" ORDER BY "due_date" DESC NULLS LAST))[1] AS monthly
      FROM "donations"
      WHERE "is_recurring" = true
        AND "due_date" < CURRENT_DATE
        AND "status" NOT IN ('paid', 'confirmed', 'refunded', 'cancelled', 'chargeback')
        ${dateAnd(f.since, f.until, Prisma.sql`"due_date"`)}
        ${pScope(f)} ${pRecur(f)}
      GROUP BY "donor_id"
    ) t
  `);
  return { value: Number(row?.value ?? 0), count: Number(row?.count ?? 0) };
}

// ------------------------ Novos vs. recorrentes / MoM ------------------------

export interface NewVsReturning {
  novos: number;
  recorrentes: number;
}

export async function getNewVsReturning(f: PaymentFilters): Promise<NewVsReturning> {
  if (!f.since) {
    const [r] = await prisma.$queryRaw<{ novos: bigint }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT "donor_id")::bigint AS novos
      FROM "donations" WHERE ${pPaid(f)} ${dateAnd(null, f.until)} ${pScope(f)} ${pRecur(f)}
    `);
    return { novos: Number(r?.novos ?? 0), recorrentes: 0 };
  }
  const upper = f.until ? Prisma.sql`AND ${EFFECTIVE_DATE} < ${f.until}` : Prisma.empty;
  const [row] = await prisma.$queryRaw<{ novos: bigint; recorrentes: bigint }[]>(
    Prisma.sql`
      WITH inperiod AS (
        SELECT DISTINCT "donor_id" AS cid
        FROM "donations"
        WHERE ${pPaid(f)} AND ${EFFECTIVE_DATE} >= ${f.since} ${upper} ${pScope(f)} ${pRecur(f)}
      ),
      prior AS (
        SELECT DISTINCT "donor_id" AS cid
        FROM "donations"
        WHERE ${pPaid(f)} AND ${EFFECTIVE_DATE} < ${f.since} ${pScope(f)} ${pRecur(f)}
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

export async function getMonthOverMonth(f: PaymentFilters): Promise<MonthOverMonth> {
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
      WHERE ${PAID} ${pScope(f)} ${pRecur(f)}
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

export async function getTopDonors(f: PaymentFilters, limit = 10): Promise<TopDonor[]> {
  const paid = f.status
    ? Prisma.sql`d."status" = ${f.status}`
    : Prisma.sql`d."status" = ANY(${PAID_STATUSES})`;
  const scope: Prisma.Sql[] = [];
  if (f.project) scope.push(Prisma.sql`d."project" = ${f.project}`);
  if (f.paymentMethod) scope.push(Prisma.sql`d."payment_method" = ${f.paymentMethod}`);
  if (f.origin === "import") scope.push(Prisma.sql`d."imported_at" IS NOT NULL`);
  if (f.origin === "asaas") scope.push(Prisma.sql`d."imported_at" IS NULL`);
  if (f.recurring === "recurring") scope.push(Prisma.sql`d."is_recurring" = true`);
  if (f.recurring === "oneoff") scope.push(Prisma.sql`d."is_recurring" = false`);
  const scopeSql = scope.length ? Prisma.sql`AND ${Prisma.join(scope, " AND ")}` : Prisma.empty;

  const rows = await prisma.$queryRaw<
    { id: string; name: string | null; email: string | null; total: number; quantidade: bigint }[]
  >(Prisma.sql`
    SELECT c."id", c."full_name" AS name, c."email",
           COALESCE(SUM(d."amount"), 0)::float8 AS total,
           COUNT(*)::bigint                      AS quantidade
    FROM "donations" d
    JOIN "donors" c ON c."id" = d."donor_id"
    WHERE ${paid} ${dateAnd(f.since, f.until, Prisma.sql`COALESCE(d."paid_at", d."confirmed_at", d."created_at")`)} ${scopeSql}
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

export interface RevenueTrend {
  spark: number[]; // arrecadação dos últimos 12 meses (mais antigo → atual)
  cur: number; // últimos 12 meses
  prev: number; // 12 meses anteriores (ano anterior)
  yoyPct: number | null; // variação vs. ano anterior
}

/** Tendência de arrecadação (12 meses) + comparativo com o ano anterior. */
export async function getRevenueTrend(f: PaymentFilters): Promise<RevenueTrend> {
  const rows = await prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', now()) - interval '11 months',
        date_trunc('month', now()),
        interval '1 month'
      ) AS m
    )
    SELECT COALESCE(SUM(d."amount"), 0)::float8 AS total
    FROM months
    LEFT JOIN "donations" d
      ON date_trunc('month', COALESCE(d."paid_at", d."confirmed_at", d."created_at")) = months.m
     AND d."status" = ANY(${PAID_STATUSES}) ${pScope(f)} ${pRecur(f)}
    GROUP BY months.m
    ORDER BY months.m
  `);
  const spark = rows.map((r) => Number(r.total));

  const [yoy] = await prisma.$queryRaw<{ cur: number; prev: number }[]>(Prisma.sql`
    SELECT
      COALESCE(SUM("amount") FILTER (
        WHERE ${EFFECTIVE_DATE} >= now() - interval '12 months'
      ), 0)::float8 AS cur,
      COALESCE(SUM("amount") FILTER (
        WHERE ${EFFECTIVE_DATE} >= now() - interval '24 months'
          AND ${EFFECTIVE_DATE} <  now() - interval '12 months'
      ), 0)::float8 AS prev
    FROM "donations"
    WHERE ${PAID} ${pScope(f)} ${pRecur(f)}
  `);
  const cur = Number(yoy?.cur ?? 0);
  const prev = Number(yoy?.prev ?? 0);
  return {
    spark,
    cur,
    prev,
    yoyPct: prev > 0 ? ((cur - prev) / prev) * 100 : null,
  };
}

/** Última execução do cron de sincronização. */
export async function getLastSync() {
  return prisma.syncLog.findFirst({ orderBy: { startedAt: "desc" } });
}

/** Data da última importação (planilhas) e total de registros importados. */
export async function getLastImport(): Promise<{ last: Date | null; count: number }> {
  const [row] = await prisma.$queryRaw<{ last: Date | null; count: bigint }[]>(Prisma.sql`
    SELECT MAX("imported_at") AS last,
           COUNT(*) FILTER (WHERE "imported_at" IS NOT NULL)::bigint AS count
    FROM "donations"
  `);
  return { last: row?.last ?? null, count: Number(row?.count ?? 0) };
}

// ============================ Detalhe dos cards =============================

export interface CardDetail {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: string[][];
  aligns?: ("left" | "right")[];
}

/** Condição de "vencida" (em aberto, vencimento < hoje). */
const OWED = Prisma.sql`"status" NOT IN ('paid','confirmed','refunded','cancelled','chargeback')`;

/** Retorna os dados por trás de um card específico, respeitando os filtros. */
export async function getCardDetail(
  card: string,
  f: PaymentFilters
): Promise<CardDetail> {
  const money: ("left" | "right")[] = [];

  switch (card) {
    case "total":
    case "mom": {
      const rows = await prisma.$queryRaw<{ mes: string; qtd: bigint; total: number }[]>(Prisma.sql`
        SELECT to_char(date_trunc('month', ${EFFECTIVE_DATE}), 'YYYY-MM') AS mes,
               COUNT(*)::bigint AS qtd,
               COALESCE(SUM("amount"),0)::float8 AS total
        FROM "donations"
        WHERE ${pPaid(f)} ${dateAnd(f.since, f.until)} ${pScope(f)} ${pRecur(f)}
        GROUP BY 1 ORDER BY 1 DESC LIMIT 24
      `);
      return {
        title: "Arrecadação por mês",
        columns: ["Mês", "Doações", "Total"],
        aligns: ["left", "right", "right"],
        rows: rows.map((r) => [r.mes, String(Number(r.qtd)), formatBRL(r.total)]),
      };
    }

    case "ticket": {
      const b = await getAmountBuckets(f);
      return {
        title: "Distribuição por faixa de valor",
        columns: ["Faixa", "Doações", "Total"],
        aligns: ["left", "right", "right"],
        rows: b.map((r) => [r.faixa, String(r.quantidade), formatBRL(r.total)]),
      };
    }

    case "doadores":
    case "doadoresbase": {
      const t = await getTopDonors(f, 200);
      return {
        title: "Doadores (por total no período)",
        subtitle: `${t.length} doadores`,
        columns: ["Doador", "Doações", "Total"],
        aligns: ["left", "right", "right"],
        rows: t.map((d) => [maskName(d.name) || d.email || "—", String(d.quantidade), formatBRL(d.total)]),
      };
    }

    case "recorrentes3": {
      const d = await listDonorsWithNRecurring(3, f);
      return {
        title: "Doadores com 3 cobranças recorrentes",
        subtitle: `${d.length} doadores`,
        columns: ["Doador", "Projeto", "Recorrências", "Total"],
        aligns: ["left", "left", "right", "right"],
        rows: d.map((x) => [maskName(x.name) || "—", x.project ?? "—", `${x.recorrentes}x`, formatBRL(x.total)]),
      };
    }

    case "mrr": {
      const rows = await prisma.$queryRaw<{ name: string | null; qtd: bigint; total: number }[]>(Prisma.sql`
        SELECT c."full_name" AS name, COUNT(*)::bigint AS qtd, COALESCE(SUM(d."amount"),0)::float8 AS total
        FROM "donations" d JOIN "donors" c ON c."id"=d."donor_id"
        WHERE d."is_recurring"=true AND d."status" = ANY(${PAID_STATUSES})
          ${(() => {
            const s: Prisma.Sql[] = [];
            if (f.project) s.push(Prisma.sql`AND d."project" = ${f.project}`);
            if (f.paymentMethod) s.push(Prisma.sql`AND d."payment_method" = ${f.paymentMethod}`);
            if (f.origin === "import") s.push(Prisma.sql`AND d."imported_at" IS NOT NULL`);
            if (f.origin === "asaas") s.push(Prisma.sql`AND d."imported_at" IS NULL`);
            return s.length ? Prisma.join(s, " ") : Prisma.empty;
          })()}
        GROUP BY c."id", c."full_name" ORDER BY total DESC LIMIT 200
      `);
      return {
        title: "Doadores recorrentes",
        subtitle: `${rows.length} recorrentes`,
        columns: ["Doador", "Recorrências", "Total"],
        aligns: ["left", "right", "right"],
        rows: rows.map((r) => [maskName(r.name) || "—", `${Number(r.qtd)}x`, formatBRL(r.total)]),
      };
    }

    case "inadimplencia":
    case "mrrinad": {
      const onlyRec = card === "mrrinad" ? Prisma.sql`AND d."is_recurring" = true` : Prisma.empty;
      const scope: Prisma.Sql[] = [];
      if (f.project) scope.push(Prisma.sql`AND d."project" = ${f.project}`);
      if (f.paymentMethod) scope.push(Prisma.sql`AND d."payment_method" = ${f.paymentMethod}`);
      if (f.origin === "import") scope.push(Prisma.sql`AND d."imported_at" IS NOT NULL`);
      if (f.origin === "asaas") scope.push(Prisma.sql`AND d."imported_at" IS NULL`);
      const rows = await prisma.$queryRaw<
        { name: string | null; method: string; amount: number; due: Date | null }[]
      >(Prisma.sql`
        SELECT c."full_name" AS name, d."payment_method" AS method,
               d."amount"::float8 AS amount, d."due_date" AS due
        FROM "donations" d JOIN "donors" c ON c."id"=d."donor_id"
        WHERE d."status" NOT IN ('paid','confirmed','refunded','cancelled','chargeback')
          AND d."due_date" < CURRENT_DATE ${onlyRec} ${scope.length ? Prisma.join(scope, " ") : Prisma.empty}
        ORDER BY d."due_date" DESC LIMIT 300
      `);
      return {
        title: card === "mrrinad" ? "Recorrentes em atraso" : "Cobranças vencidas (em aberto)",
        subtitle: `${rows.length} cobranças`,
        columns: ["Doador", "Forma", "Vencimento", "Valor"],
        aligns: ["left", "left", "left", "right"],
        rows: rows.map((r) => [maskName(r.name) || "—", paymentMethodLabel(r.method), formatDate(r.due), formatBRL(r.amount)]),
      };
    }

    case "areceber": {
      const scope: Prisma.Sql[] = [];
      if (f.project) scope.push(Prisma.sql`AND d."project" = ${f.project}`);
      if (f.paymentMethod) scope.push(Prisma.sql`AND d."payment_method" = ${f.paymentMethod}`);
      if (f.origin === "import") scope.push(Prisma.sql`AND d."imported_at" IS NOT NULL`);
      if (f.origin === "asaas") scope.push(Prisma.sql`AND d."imported_at" IS NULL`);
      const rows = await prisma.$queryRaw<
        { name: string | null; method: string; amount: number; due: Date | null }[]
      >(Prisma.sql`
        SELECT c."full_name" AS name, d."payment_method" AS method,
               d."amount"::float8 AS amount, d."due_date" AS due
        FROM "donations" d JOIN "donors" c ON c."id"=d."donor_id"
        WHERE d."status" NOT IN ('paid','confirmed','refunded','cancelled','chargeback')
          AND (d."due_date" >= CURRENT_DATE OR d."due_date" IS NULL)
          ${scope.length ? Prisma.join(scope, " ") : Prisma.empty}
        ORDER BY d."due_date" ASC NULLS LAST LIMIT 300
      `);
      return {
        title: "A receber (pendentes a vencer)",
        subtitle: `${rows.length} cobranças`,
        columns: ["Doador", "Forma", "Vencimento", "Valor"],
        aligns: ["left", "left", "left", "right"],
        rows: rows.map((r) => [maskName(r.name) || "—", paymentMethodLabel(r.method), formatDate(r.due), formatBRL(r.amount)]),
      };
    }

    case "maior": {
      const rows = await prisma.$queryRaw<
        { name: string | null; method: string; amount: number; eff: Date | null }[]
      >(Prisma.sql`
        SELECT c."full_name" AS name, d."payment_method" AS method,
               d."amount"::float8 AS amount,
               COALESCE(d."paid_at", d."confirmed_at", d."created_at") AS eff
        FROM "donations" d JOIN "donors" c ON c."id"=d."donor_id"
        WHERE ${(() => {
          const base = f.status ? Prisma.sql`d."status" = ${f.status}` : Prisma.sql`d."status" = ANY(${PAID_STATUSES})`;
          const s: Prisma.Sql[] = [base];
          if (f.project) s.push(Prisma.sql`d."project" = ${f.project}`);
          if (f.paymentMethod) s.push(Prisma.sql`d."payment_method" = ${f.paymentMethod}`);
          if (f.origin === "import") s.push(Prisma.sql`d."imported_at" IS NOT NULL`);
          if (f.origin === "asaas") s.push(Prisma.sql`d."imported_at" IS NULL`);
          return Prisma.join(s, " AND ");
        })()}
        ORDER BY d."amount" DESC LIMIT 100
      `);
      return {
        title: "Maiores doações",
        columns: ["Doador", "Forma", "Data", "Valor"],
        aligns: ["left", "left", "left", "right"],
        rows: rows.map((r) => [maskName(r.name) || "—", paymentMethodLabel(r.method), formatDate(r.eff), formatBRL(r.amount)]),
      };
    }

    case "conversao": {
      const b = await getStatusBreakdown(f);
      return {
        title: "Cobranças por status",
        columns: ["Status", "Qtd", "Valor"],
        aligns: ["left", "right", "right"],
        rows: b.map((r) => [statusLabel(r.status), String(r.quantidade), formatBRL(r.total)]),
      };
    }

    default:
      return { title: "Detalhe", columns: ["Info"], rows: [["Sem detalhamento disponível."]] };
  }
}

// =============================== Análises extras =============================

export interface StatusBreakdown {
  status: string;
  total: number;
  quantidade: number;
}

/** Distribuição das doações por status (mostra todos; ignora o filtro de status). */
export async function getStatusBreakdown(f: PaymentFilters): Promise<StatusBreakdown[]> {
  const rows = await prisma.$queryRaw<
    { status: string; total: number; quantidade: bigint }[]
  >(Prisma.sql`
    SELECT "status",
           COALESCE(SUM("amount"), 0)::float8 AS total,
           COUNT(*)::bigint                    AS quantidade
    FROM "donations"
    WHERE TRUE ${dateAnd(f.since, f.until)} ${pScope(f)} ${pRecur(f)}
    GROUP BY "status"
    ORDER BY total DESC
  `);
  return rows.map((r) => ({
    status: r.status,
    total: Number(r.total),
    quantidade: Number(r.quantidade),
  }));
}

export interface AmountBucket {
  faixa: string;
  total: number;
  quantidade: number;
}

export async function getAmountBuckets(f: PaymentFilters): Promise<AmountBucket[]> {
  const rows = await prisma.$queryRaw<
    { faixa: string; ordem: number; total: number; quantidade: bigint }[]
  >(Prisma.sql`
    SELECT
      CASE
        WHEN "amount" < 50  THEN 'Até R$ 50'
        WHEN "amount" < 100 THEN 'R$ 50–100'
        WHEN "amount" < 250 THEN 'R$ 100–250'
        WHEN "amount" < 500 THEN 'R$ 250–500'
        ELSE 'R$ 500+'
      END AS faixa,
      CASE
        WHEN "amount" < 50 THEN 1 WHEN "amount" < 100 THEN 2
        WHEN "amount" < 250 THEN 3 WHEN "amount" < 500 THEN 4 ELSE 5
      END AS ordem,
      COALESCE(SUM("amount"), 0)::float8 AS total,
      COUNT(*)::bigint                    AS quantidade
    FROM "donations"
    WHERE ${pPaid(f)} ${dateAnd(f.since, f.until)} ${pScope(f)} ${pRecur(f)}
    GROUP BY 1, 2
    ORDER BY 2
  `);
  return rows.map((r) => ({
    faixa: r.faixa,
    total: Number(r.total),
    quantidade: Number(r.quantidade),
  }));
}

export interface MonthlyByProject {
  data: Array<Record<string, string | number>>;
  projects: string[];
}

export async function getMonthlyByProject(f: PaymentFilters): Promise<MonthlyByProject> {
  const rows = await prisma.$queryRaw<
    { mes: string; project: string; total: number }[]
  >(Prisma.sql`
    SELECT to_char(date_trunc('month', ${EFFECTIVE_DATE}), 'YYYY-MM') AS mes,
           COALESCE("project", 'Não classificado')                     AS project,
           COALESCE(SUM("amount"), 0)::float8                          AS total
    FROM "donations"
    WHERE ${pPaid(f)} ${dateAnd(f.since, f.until)} ${pScope(f)} ${pRecur(f)}
    GROUP BY 1, 2
    ORDER BY 1 ASC
  `);

  const projects = Array.from(new Set(rows.map((r) => r.project)));
  const byMonth = new Map<string, Record<string, string | number>>();
  for (const r of rows) {
    const row = byMonth.get(r.mes) ?? { mes: r.mes };
    row[r.project] = Number(r.total);
    byMonth.set(r.mes, row);
  }
  const data = Array.from(byMonth.values()).map((row) => {
    for (const p of projects) if (row[p] === undefined) row[p] = 0;
    return row;
  });
  return { data, projects };
}

export interface ExtraKpis {
  conversao: number;
  maiorDoacao: number;
  recorrenteShare: number;
  totalDoadoresCadastrados: number;
}

export async function getExtraKpis(f: PaymentFilters): Promise<ExtraKpis> {
  const [row] = await prisma.$queryRaw<
    {
      paid_count: bigint;
      total_count: bigint;
      max_amount: number;
      rec_amount: number;
      paid_amount: number;
    }[]
  >(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE ${PAID})::bigint                              AS paid_count,
      COUNT(*)::bigint                                                     AS total_count,
      COALESCE(MAX("amount") FILTER (WHERE ${PAID}), 0)::float8            AS max_amount,
      COALESCE(SUM("amount") FILTER (WHERE ${PAID} AND "is_recurring"), 0)::float8 AS rec_amount,
      COALESCE(SUM("amount") FILTER (WHERE ${PAID}), 0)::float8            AS paid_amount
    FROM "donations"
    WHERE TRUE ${dateAnd(f.since, f.until)} ${pScope(f)} ${pRecur(f)}
  `);
  const paidCount = Number(row?.paid_count ?? 0);
  const totalCount = Number(row?.total_count ?? 0);
  const paidAmount = Number(row?.paid_amount ?? 0);
  const recAmount = Number(row?.rec_amount ?? 0);
  const totalDoadoresCadastrados = await prisma.donor.count();
  return {
    conversao: totalCount > 0 ? (paidCount / totalCount) * 100 : 0,
    maiorDoacao: Number(row?.max_amount ?? 0),
    recorrenteShare: paidAmount > 0 ? (recAmount / paidAmount) * 100 : 0,
    totalDoadoresCadastrados,
  };
}
