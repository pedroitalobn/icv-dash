import { redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { UsersManager } from "@/components/UsersManager";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const users = await prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      lastLoginAt: true,
    },
  });

  return (
    <>
      <Topbar email={user.email} />
      <main className="container">
        <div className="section-title" style={{ marginTop: 8 }}>
          Controle de usuários
        </div>
        <UsersManager
          initialUsers={users.map((u) => ({
            ...u,
            lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
          }))}
          currentUserId={user.id}
          canManage={user.role === "admin"}
        />
      </main>
    </>
  );
}
