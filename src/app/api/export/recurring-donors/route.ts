// Exportação CSV dos doadores com N cobranças recorrentes (padrão N=3).
import { NextRequest, NextResponse } from "next/server";
import { listDonorsWithNRecurring } from "@/lib/queries";
import { parseFilters } from "@/lib/filters";
import { displayName } from "@/lib/format";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const query = Object.fromEntries(req.nextUrl.searchParams.entries());
  const { paymentFilters } = parseFilters(query);
  const n = Number(query.n) || 3;

  const user = await getCurrentUser();
  const isAdmin = user?.role === "admin";

  const donors = await listDonorsWithNRecurring(n, paymentFilters);

  const header = [
    "Doador",
    "Email",
    "CPF/CNPJ",
    "Telefone",
    "Projeto",
    "Recorrências",
    "Total doado",
  ];
  const lines = [header.map(csvCell).join(";")];
  for (const d of donors) {
    lines.push(
      [
        displayName(d.name, isAdmin),
        isAdmin ? d.email ?? "" : "",
        isAdmin ? d.documentNumber ?? "" : "",
        isAdmin ? d.mobilePhone ?? "" : "",
        d.project ?? "",
        String(d.recorrentes),
        d.total.toFixed(2).replace(".", ","),
      ]
        .map(csvCell)
        .join(";")
    );
  }

  const csv = "﻿" + lines.join("\r\n");
  const filename = `doadores-${n}-recorrencias-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
