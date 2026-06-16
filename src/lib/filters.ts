// Interpretação dos filtros vindos da URL (querystring), usada pela página e pelo export.
import { periodToDate, type Period, type PaymentFilters } from "./periods";

export const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "365d", label: "12 meses" },
  { key: "all", label: "Tudo" },
];

export const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "paid", label: "Recebido" },
  { value: "confirmed", label: "Confirmado" },
  { value: "pending", label: "Pendente" },
  { value: "overdue", label: "Vencido" },
  { value: "refunded", label: "Estornado" },
  { value: "cancelled", label: "Cancelado" },
];

export const BILLING_OPTIONS = [
  { value: "", label: "Todas as formas" },
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "credit_card", label: "Cartão de crédito" },
  { value: "debit_card", label: "Cartão de débito" },
];

export const RECURRING_OPTIONS = [
  { value: "", label: "Todas" },
  { value: "recurring", label: "Recorrentes" },
  { value: "oneoff", label: "Avulsas" },
];

export const PROJECT_OPTIONS = [
  { value: "", label: "Todos os projetos" },
  { value: "Cruz da Vida", label: "Cruz da Vida" },
  { value: "Deixai Vir a Mim", label: "Deixai Vir a Mim" },
];

export const ORIGIN_OPTIONS = [
  { value: "", label: "Todas as origens" },
  { value: "asaas", label: "Conta Asaas (API)" },
  { value: "import", label: "Importado (planilhas)" },
];

export interface ParsedFilters {
  period: Period;
  from: string;
  until: string;
  status: string;
  billingType: string; // payment_method
  recurring: string;
  project: string;
  origin: string;
  q: string;
  since: Date | null;
  untilDate: Date | null;
  paymentFilters: PaymentFilters;
}

type Query = Record<string, string | string[] | undefined>;

function str(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v ?? "").trim();
}

function parseDay(value: string, endOfDay = false): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) d.setDate(d.getDate() + 1);
  return d;
}

export function parseFilters(query: Query): ParsedFilters {
  const from = str(query.from);
  const until = str(query.until);
  const status = str(query.status);
  const billingType = str(query.forma);
  const recurring = str(query.rec);
  const project = str(query.projeto);
  const origin = str(query.origem);
  const q = str(query.q);

  const hasRange = Boolean(parseDay(from) || parseDay(until));
  const periodRaw = str(query.period) || "30d";
  const period: Period = hasRange
    ? "custom"
    : ((PERIOD_OPTIONS.some((p) => p.key === periodRaw) ? periodRaw : "30d") as Period);

  const since = hasRange ? parseDay(from) : periodToDate(period);
  let untilDate = hasRange ? parseDay(until, true) : null;
  // "Hoje": limita ao fim do dia (início de amanhã).
  if (!hasRange && period === "today") {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    t.setDate(t.getDate() + 1);
    untilDate = t;
  }

  return {
    period,
    from,
    until,
    status,
    billingType,
    recurring,
    project,
    origin,
    q,
    since,
    untilDate,
    paymentFilters: {
      since,
      until: untilDate,
      status: status || null,
      paymentMethod: billingType || null,
      recurring: recurring === "recurring" || recurring === "oneoff" ? recurring : null,
      project: project || null,
      origin: origin === "import" || origin === "asaas" ? origin : null,
      q: q || null,
    },
  };
}

export function buildQuery(
  f: Partial<{
    period: string;
    from: string;
    until: string;
    status: string;
    forma: string;
    rec: string;
    projeto: string;
    origem: string;
    q: string;
    page: number | string;
  }>
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined && v !== null && String(v) !== "") params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}
