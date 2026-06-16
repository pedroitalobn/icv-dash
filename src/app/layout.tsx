import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cruz da Vida — Painel de Doações",
  description: "Dashboard de doações integrado à API de cobranças do Asaas.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
