// Helper para ler a sessão atual em Server Components / Route Handlers (runtime Node).
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { verifySession, SESSION_COOKIE } from "./auth";

export async function getCurrentUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) return null;
  const user = await prisma.adminUser.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  return user && user.active ? user : null;
}
