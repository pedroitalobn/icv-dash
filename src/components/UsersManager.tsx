"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
}

export function UsersManager({
  initialUsers,
  currentUserId,
  canManage,
}: {
  initialUsers: User[];
  currentUserId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("admin");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao criar usuário");
      setUsers((u) => [...u, { ...data.user, lastLoginAt: null }]);
      setEmail("");
      setName("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(u: User) {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !u.active }),
    });
    if (res.ok) {
      setUsers((list) =>
        list.map((x) => (x.id === u.id ? { ...x, active: !u.active } : x))
      );
    }
  }

  async function removeUser(u: User) {
    if (!confirm(`Remover o usuário ${u.email}?`)) return;
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    if (res.ok) setUsers((list) => list.filter((x) => x.id !== u.id));
    router.refresh();
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr", gap: 20 }}>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Nome</th>
              <th>Perfil</th>
              <th>Status</th>
              <th>Último acesso</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.name ?? "—"}</td>
                <td>
                  <span className="badge gray">{u.role}</span>
                </td>
                <td>
                  <span className={`badge ${u.active ? "green" : "red"}`}>
                    {u.active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="muted">
                  {u.lastLoginAt
                    ? new Date(u.lastLoginAt).toLocaleString("pt-BR")
                    : "—"}
                </td>
                {canManage && (
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {u.id !== currentUserId && (
                      <>
                        <button
                          className="btn-ghost"
                          style={{ padding: "5px 10px", fontSize: 12, marginRight: 6 }}
                          onClick={() => toggleActive(u)}
                        >
                          {u.active ? "Desativar" : "Ativar"}
                        </button>
                        <button
                          className="btn-ghost"
                          style={{ padding: "5px 10px", fontSize: 12, color: "#b91c1c" }}
                          onClick={() => removeUser(u)}
                        >
                          Remover
                        </button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage && (
        <div className="card" style={{ maxWidth: 520 }}>
          <h3 style={{ marginTop: 0 }}>Novo usuário</h3>
          <form onSubmit={createUser}>
            <label>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <label>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <div className="row">
              <div style={{ flex: 1 }}>
                <label>Senha (mín. 8)</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div style={{ width: 160 }}>
                <label>Perfil</label>
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="admin">Admin</option>
                  <option value="viewer">Visualizador</option>
                </select>
              </div>
            </div>
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={loading} style={{ marginTop: 16 }}>
              {loading ? "Criando..." : "Criar usuário"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
