// Atualizar / desativar usuário admin.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const current = await getCurrentUser();
  if (current?.role !== "admin") {
    return NextResponse.json({ error: "Apenas admin" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.active === "boolean") data.active = body.active;
  if (body.role === "admin" || body.role === "viewer") data.role = body.role;
  if (typeof body.password === "string" && body.password.length >= 8) {
    data.passwordHash = await hashPassword(body.password);
  }

  const user = await prisma.adminUser.update({
    where: { id: params.id },
    data,
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  return NextResponse.json({ user });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const current = await getCurrentUser();
  if (current?.role !== "admin") {
    return NextResponse.json({ error: "Apenas admin" }, { status: 403 });
  }
  if (current.id === params.id) {
    return NextResponse.json(
      { error: "Você não pode remover o próprio usuário" },
      { status: 400 }
    );
  }
  await prisma.adminUser.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
