// Helpers de formatação (pt-BR) e mapeamentos dos enums do CRM.

export function formatBRL(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return (n ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

// payment_method (enum do CRM): pix|boleto|credit_card|debit_card|bank_transfer|other|undefined
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: "PIX",
  boleto: "Boleto",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  bank_transfer: "Transferência",
  other: "Outro",
  undefined: "Não definido",
};

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "Não definido";
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

// status (enum do CRM): pending|paid|confirmed|overdue|refunded|chargeback|cancelled|failed
const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  paid: "Recebido",
  confirmed: "Confirmado",
  overdue: "Vencido",
  refunded: "Estornado",
  chargeback: "Chargeback",
  cancelled: "Cancelado",
  failed: "Falhou",
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return STATUS_LABELS[status] ?? status;
}

// Status que contam como "valor efetivamente arrecadado".
export const PAID_STATUSES = ["paid", "confirmed"];

/**
 * Exibe apenas o primeiro nome do doador, mascarando os demais com `*`
 * (privacidade). Ex.: "Maria do Carmo Moreira" → "Maria ** ***** *******".
 */
export function maskName(full: string | null | undefined): string {
  const name = (full ?? "").trim().replace(/\s+/g, " ");
  if (!name) return "";
  const parts = name.split(" ");
  const first = parts[0];
  if (parts.length === 1) return first;
  const rest = parts
    .slice(1)
    .map((p) => "*".repeat(Math.min(8, Math.max(2, p.length))));
  return [first, ...rest].join(" ");
}

// --- Mapeamentos de origem (Asaas API e planilhas) → enums do CRM ---

export function mapAsaasBillingType(billingType: string | null | undefined): string {
  switch ((billingType ?? "").toUpperCase()) {
    case "PIX":
      return "pix";
    case "BOLETO":
      return "boleto";
    case "CREDIT_CARD":
      return "credit_card";
    case "DEBIT_CARD":
      return "debit_card";
    case "TRANSFER":
      return "bank_transfer";
    case "UNDEFINED":
      return "undefined";
    default:
      return "other";
  }
}

export function mapAsaasStatus(status: string | null | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "RECEIVED":
    case "RECEIVED_IN_CASH":
      return "paid";
    case "CONFIRMED":
      return "confirmed";
    case "PENDING":
    case "AWAITING_RISK_ANALYSIS":
      return "pending";
    case "OVERDUE":
      return "overdue";
    case "REFUNDED":
    case "REFUND_REQUESTED":
      return "refunded";
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
      return "chargeback";
    default:
      return "pending";
  }
}

// Planilhas do Asaas (português)
export function mapPlanilhaForma(forma: string | null | undefined): string {
  const f = (forma ?? "").trim().toLowerCase();
  if (f.includes("pix")) return "pix";
  if (f.includes("boleto")) return "boleto";
  if (f.includes("crédito") || f.includes("credito")) return "credit_card";
  if (f.includes("débito") || f.includes("debito")) return "debit_card";
  if (f.includes("transfer")) return "bank_transfer";
  if (f.includes("pergunte")) return "undefined";
  return "other";
}

export function mapPlanilhaSituacao(situacao: string | null | undefined): string {
  const s = (situacao ?? "").trim().toLowerCase();
  if (s.startsWith("receb")) return "paid";
  if (s.startsWith("confirm")) return "confirmed";
  if (s.startsWith("venc")) return "overdue";
  if (s.startsWith("aguard") || s.startsWith("pend")) return "pending";
  if (s.startsWith("estorn") || s.includes("reembol")) return "refunded";
  if (s.startsWith("cancel")) return "cancelled";
  return "pending";
}
