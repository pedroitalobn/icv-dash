// Seed do usuário admin a partir das variáveis de ambiente.
// Executado no primeiro deploy (após `prisma migrate deploy`).
// Idempotente: se o admin já existe, apenas atualiza a senha/dados.

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn(
      "[seed] ADMIN_EMAIL/ADMIN_PASSWORD não definidos — pulando seed do admin."
    );
    return;
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.adminUser.upsert({
    where: { email },
    create: { email, name: "Administrador", passwordHash, role: "admin" },
    update: { passwordHash, active: true },
  });

  console.log(`[seed] Admin garantido: ${user.email}`);
}

main()
  .catch((e) => {
    console.error("[seed] erro:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
