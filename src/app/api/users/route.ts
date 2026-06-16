// CRUD básico de usuários admin (controle de acesso). Protegido pelo middleware.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const users = await prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const current = await getCurrentUser();
  if (current?.role !== "admin") {
    return NextResponse.json({ error: "Apenas admin" }, { status: 403 });
  }

  let body: { email?: string; name?: string; password?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || password.length < 8) {
    return NextResponse.json(
      { error: "E-mail obrigatório e senha com no mínimo 8 caracteres" },
      { status: 400 }
    );
  }

  const exists = await prisma.adminUser.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 409 });
  }

  const user = await prisma.adminUser.create({
    data: {
      email,
      name: body.name?.trim() || null,
      passwordHash: await hashPassword(password),
      role: body.role === "viewer" ? "viewer" : "admin",
    },
    select: { id: true, email: true, name: true, role: true, active: true },
  });

  return NextResponse.json({ user }, { status: 201 });
}
