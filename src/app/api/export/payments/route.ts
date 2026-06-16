// Exportação das transações do período em CSV (Excel-friendly, separador ;).
import { NextRequest, NextResponse } from "next/server";
import { exportDonations } from "@/lib/queries";
import { parseFilters } from "@/lib/filters";
import { paymentMethodLabel, statusLabel, displayName } from "@/lib/format";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function fmtDate(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString("pt-BR") : "";
}

export async function GET(req: NextRequest) {
  const query = Object.fromEntries(req.nextUrl.searchParams.entries());
  const { paymentFilters, period } = parseFilters(query);

  const user = await getCurrentUser();
  const isAdmin = user?.role === "admin";

  const payments = await exportDonations(paymentFilters);

  const header = [
    "ID",
    "Doador",
    "Email",
    "CPF/CNPJ",
    "Projeto",
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
        displayName(p.customerName, isAdmin),
        isAdmin ? p.customerEmail ?? "" : "",
        isAdmin ? p.documentNumber ?? "" : "",
        p.project ?? "",
        paymentMethodLabel(p.billingType),
        statusLabel(p.status),
        p.isRecurring ? "Sim" : "Não",
        (p.value ?? "").replace(".", ","),
        p.netValue ? p.netValue.replace(".", ",") : "",
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
