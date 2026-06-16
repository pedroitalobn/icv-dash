// Exportação das transações do período em CSV (Excel-friendly, separador ;).
import { NextRequest, NextResponse } from "next/server";
import { exportPayments, periodToDate, type Period } from "@/lib/queries";
import { billingTypeLabel, statusLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function fmtDate(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR") : "";
}

export async function GET(req: NextRequest) {
  const periodParam = req.nextUrl.searchParams.get("period") ?? "30d";
  const period = (
    ["7d", "30d", "90d", "365d", "all"].includes(periodParam)
      ? periodParam
      : "30d"
  ) as Period;
  const since = periodToDate(period);

  const payments = await exportPayments(since);

  const header = [
    "ID",
    "Doador",
    "Email",
    "CPF/CNPJ",
    "Forma de pagamento",
    "Status",
    "Recorrente",
    "Valor",
    "Valor líquido",
    "Data pagamento",
    "Vencimento",
    "Criada em",
  ];

  const lines = [header.map(csvCell).join(";")];
  for (const p of payments) {
    lines.push(
      [
        p.id,
        p.customer?.name ?? "",
        p.customer?.email ?? "",
        p.customer?.cpfCnpj ?? "",
        billingTypeLabel(p.billingType),
        statusLabel(p.status),
        p.subscriptionId ? "Sim" : "Não",
        p.value.toString().replace(".", ","),
        p.netValue ? p.netValue.toString().replace(".", ",") : "",
        fmtDate(p.paymentDate),
        fmtDate(p.dueDate),
        fmtDate(p.dateCreated),
      ]
        .map(csvCell)
        .join(";")
    );
  }

  // BOM para o Excel reconhecer UTF-8 (acentos).
  const csv = "﻿" + lines.join("\r\n");
  const filename = `doacoes-${period}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
