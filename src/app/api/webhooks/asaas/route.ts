// Webhook do Asaas — recebe eventos de cobrança em tempo real e atualiza o banco.
// Configure em: Asaas > Integrações > Webhooks, apontando para:
//   https://SEU_DOMINIO/api/webhooks/asaas
// e defina o "Token de autenticação" igual a ASAAS_WEBHOOK_TOKEN.
import { NextRequest, NextResponse } from "next/server";
import { ingestAsaasPayment } from "@/lib/sync";
import type { AsaasPayment } from "@/lib/asaas";

export const dynamic = "force-dynamic";

interface AsaasWebhookEvent {
  event: string; // PAYMENT_CREATED, PAYMENT_RECEIVED, PAYMENT_CONFIRMED, ...
  payment?: AsaasPayment;
}

export async function POST(req: NextRequest) {
  // Validação do token enviado pelo Asaas.
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  const received = req.headers.get("asaas-access-token");
  if (expected && received !== expected) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  let body: AsaasWebhookEvent;
  try {
    body = (await req.json()) as AsaasWebhookEvent;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const p = body.payment;
  if (!p) {
    return NextResponse.json({ ok: true, ignored: body.event });
  }

  try {
    await ingestAsaasPayment(p);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, event: body.event, paymentId: p.id });
}
