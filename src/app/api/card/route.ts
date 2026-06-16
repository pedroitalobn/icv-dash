// Detalhe (dados por trás) de um card específico, respeitando os filtros atuais.
import { NextRequest, NextResponse } from "next/server";
import { getCardDetail } from "@/lib/queries";
import { parseFilters } from "@/lib/filters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const query = Object.fromEntries(req.nextUrl.searchParams.entries());
  const card = String(query.card ?? "");
  if (!card) {
    return NextResponse.json({ error: "card ausente" }, { status: 400 });
  }
  const { paymentFilters } = parseFilters(query);
  try {
    const detail = await getCardDetail(card, paymentFilters);
    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
