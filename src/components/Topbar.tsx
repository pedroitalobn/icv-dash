import Link from "next/link";
import { LogoutButton } from "./LogoutButton";

export function Topbar({ email }: { email?: string }) {
  return (
    <div className="topbar">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo" src="/logo.svg" alt="Cruz da Vida" />
      <div>
        <div className="title">Cruz da Vida</div>
        <div className="subtitle">Painel de Doações · Asaas</div>
      </div>
      <div className="spacer" />
      <nav>
        <Link href="/">Dashboard</Link>
        <Link href="/usuarios">Usuários</Link>
      </nav>
      {email && <span className="user">{email}</span>}
      <LogoutButton />
    </div>
  );
}
