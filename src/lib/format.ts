// Helpers de formatação (pt-BR).

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

const BILLING_LABELS: Record<string, string> = {
  PIX: "PIX",
  BOLETO: "Boleto",
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
  TRANSFER: "Transferência",
  DEPOSIT: "Depósito",
  UNDEFINED: "Não definido",
};

export function billingTypeLabel(type: string | null | undefined): string {
  if (!type) return "Não definido";
  return BILLING_LABELS[type] ?? type;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  RECEIVED: "Recebido",
  CONFIRMED: "Confirmado",
  RECEIVED_IN_CASH: "Recebido (dinheiro)",
  OVERDUE: "Vencido",
  REFUNDED: "Estornado",
  REFUND_REQUESTED: "Estorno solicitado",
  CHARGEBACK_REQUESTED: "Chargeback solicitado",
  AWAITING_RISK_ANALYSIS: "Em análise",
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return STATUS_LABELS[status] ?? status;
}

// Status que contam como "valor efetivamente arrecadado".
export const PAID_STATUSES = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"];
