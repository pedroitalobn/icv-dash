// Interpretação dos filtros vindos da URL (querystring), usada pela página e pelo export.
import { periodToDate, type Period, type PaymentFilters } from "./queries";

export const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "365d", label: "12 meses" },
  { key: "all", label: "Tudo" },
];

export const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "RECEIVED", label: "Recebido" },
  { value: "CONFIRMED", label: "Confirmado" },
  { value: "PENDING", label: "Pendente" },
  { value: "OVERDUE", label: "Vencido" },
  { value: "REFUNDED", label: "Estornado" },
];

export const BILLING_OPTIONS = [
  { value: "", label: "Todas as formas" },
  { value: "PIX", label: "PIX" },
  { value: "BOLETO", label: "Boleto" },
  { value: "CREDIT_CARD", label: "Cartão de crédito" },
  { value: "DEBIT_CARD", label: "Cartão de débito" },
];

export const RECURRING_OPTIONS = [
  { value: "", label: "Todas" },
  { value: "recurring", label: "Recorrentes" },
  { value: "oneoff", label: "Avulsas" },
];

export interface ParsedFilters {
  period: Period;
  from: string; // YYYY-MM-DD (vazio se não setado)
  until: string;
  status: string;
  billingType: string;
  recurring: string;
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
  // Para o limite superior, usamos o início do dia seguinte (comparação `<`).
  if (endOfDay) d.setDate(d.getDate() + 1);
  return d;
}

export function parseFilters(query: Query): ParsedFilters {
  const from = str(query.from);
  const until = str(query.until);
  const status = str(query.status);
  const billingType = str(query.forma);
  const recurring = str(query.rec);
  const q = str(query.q);

  const hasRange = Boolean(parseDay(from) || parseDay(until));
  const periodRaw = str(query.period) || "30d";
  const period: Period = hasRange
    ? "custom"
    : (PERIOD_OPTIONS.some((p) => p.key === periodRaw)
        ? periodRaw
        : "30d") as Period;

  const since = hasRange ? parseDay(from) : periodToDate(period);
  const untilDate = hasRange ? parseDay(until, true) : null;

  return {
    period,
    from,
    until,
    status,
    billingType,
    recurring,
    q,
    since,
    untilDate,
    paymentFilters: {
      since,
      until: untilDate,
      status: status || null,
      billingType: billingType || null,
      recurring:
        recurring === "recurring" || recurring === "oneoff" ? recurring : null,
      q: q || null,
    },
  };
}

/** Reconstrói a querystring preservando os filtros (para links de paginação/export). */
export function buildQuery(
  f: Partial<{
    period: string;
    from: string;
    until: string;
    status: string;
    forma: string;
    rec: string;
    q: string;
    page: number | string;
  }>
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined && v !== null && String(v) !== "") {
      params.set(k, String(v));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}
