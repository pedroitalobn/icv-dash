import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
import { FullWidthToggle } from "./FullWidthToggle";
import { ThemeToggle } from "./ThemeToggle";
import { BrandLogo } from "./BrandLogo";

export function Topbar({ email }: { email?: string }) {
  return (
    <div className="topbar">
      <BrandLogo className="logo" />
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
      <ThemeToggle />
      <FullWidthToggle />
      <LogoutButton />
    </div>
  );
}
