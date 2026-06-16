// Detalhe (dados por trás) de um card específico, respeitando os filtros atuais.
import { NextRequest, NextResponse } from "next/server";
import { getCardDetail } from "@/lib/queries";
import { parseFilters } from "@/lib/filters";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const query = Object.fromEntries(req.nextUrl.searchParams.entries());
  const card = String(query.card ?? "");
  if (!card) {
    return NextResponse.json({ error: "card ausente" }, { status: 400 });
  }
  const { paymentFilters } = parseFilters(query);

  // Só admin pode revelar dados sensíveis (mesmo que force ?reveal=1).
  const user = await getCurrentUser();
  const reveal = user?.role === "admin" && query.reveal === "1";

  try {
    const detail = await getCardDetail(card, paymentFilters, reveal);
    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
