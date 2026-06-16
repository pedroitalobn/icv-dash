// Webhook do Asaas — recebe eventos de cobrança em tempo real e atualiza o banco.
// Configure em: Asaas > Integrações > Webhooks, apontando para:
//   https://SEU_DOMINIO/api/webhooks/asaas
// e defina o "Token de autenticação" igual a ASAAS_WEBHOOK_TOKEN.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { AsaasPayment } from "@/lib/asaas";

export const dynamic = "force-dynamic";

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

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
    // Evento sem payload de cobrança (ex.: eventos de assinatura) — apenas confirma.
    return NextResponse.json({ ok: true, ignored: body.event });
  }

  // Garante o cliente (FK) e faz upsert da cobrança.
  await prisma.customer.upsert({
    where: { id: p.customer },
    create: { id: p.customer },
    update: {},
  });

  const subscriptionId = p.subscription
    ? (await prisma.subscription.findUnique({ where: { id: p.subscription } }))
        ?.id ?? null
    : null;

  const data = {
    customerId: p.customer,
    subscriptionId,
    value: p.value,
    netValue: p.netValue,
    billingType: p.billingType,
    status: p.status,
    description: p.description,
    invoiceUrl: p.invoiceUrl,
    dueDate: toDate(p.dueDate),
    paymentDate: toDate(p.paymentDate),
    confirmedDate: toDate(p.confirmedDate),
    dateCreated: toDate(p.dateCreated),
    syncedAt: new Date(),
  };

  await prisma.payment.upsert({
    where: { id: p.id },
    create: { id: p.id, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true, event: body.event, paymentId: p.id });
}
