// Módulo CLIENT-SAFE: tipos e helpers de período/filtros usados tanto no
// servidor (queries) quanto no cliente (FiltersBar). NÃO pode importar Prisma.

export type Period = "7d" | "30d" | "90d" | "365d" | "all" | "custom";

export function periodToDate(period: Period): Date | null {
  if (period === "all" || period === "custom") return null;
  const days = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 }[period];
  const d = new Date();
  d.setDate(d.getDate() - (days ?? 30));
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface PaymentFilters {
  since: Date | null;
  until: Date | null;
  status?: string | null;
  paymentMethod?: string | null;
  recurring?: "recurring" | "oneoff" | null;
  project?: string | null;
  q?: string | null;
}
