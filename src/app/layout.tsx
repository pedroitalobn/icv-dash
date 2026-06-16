import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cruz da Vida — Painel de Doações",
  description: "Dashboard de doações integrado à API de cobranças do Asaas.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#b21e2b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Aplica preferências (tema/largura/filtros fixos) antes da pintura (evita flash).
  const initScript = `(function(){try{
    var t=localStorage.getItem('icv-theme');
    var d=t?t==='dark':(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
    var c=document.body.classList;
    if(d)c.add('dark');
    if(localStorage.getItem('icv-wide')==='1')c.add('wide');
    if(localStorage.getItem('icv-pin-filters')==='1')c.add('filters-pinned');
  }catch(e){}})();`;
  return (
    <html lang="pt-BR">
      <body>
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
        {children}
      </body>
    </html>
  );
}
