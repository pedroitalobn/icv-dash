"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  PERIOD_OPTIONS,
  STATUS_OPTIONS,
  BILLING_OPTIONS,
  RECURRING_OPTIONS,
  PROJECT_OPTIONS,
  ORIGIN_OPTIONS,
} from "@/lib/filters";

export function FiltersBar({ isAdmin = false }: { isAdmin?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pinned, setPinned] = useState(false);
  const revealed = params.get("reveal") === "1";

  function toggleReveal() {
    update({ reveal: revealed ? null : "1" }, false);
  }

  useEffect(() => {
    const p = localStorage.getItem("icv-pin-filters") === "1";
    setPinned(p);
    document.body.classList.toggle("filters-pinned", p);
  }, []);

  function togglePin() {
    const p = !pinned;
    setPinned(p);
    localStorage.setItem("icv-pin-filters", p ? "1" : "0");
    document.body.classList.toggle("filters-pinned", p);
  }

  const period = params.get("period") ?? "30d";
  const hasRange = Boolean(params.get("from") || params.get("until"));

  function update(next: Record<string, string | null>, resetPage = true) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    if (resetPage) sp.delete("page");
    router.push(`/?${sp.toString()}`);
  }

  function selectPeriod(key: string) {
    // Período predefinido limpa o intervalo customizado.
    update({ period: key, from: null, until: null });
  }

  return (
    <div className="card filters-bar" style={{ marginBottom: 16 }}>
      {/* Períodos predefinidos */}
      <div className="filters">
        {PERIOD_OPTIONS.map((p) => (
          <a
            key={p.key}
            onClick={() => selectPeriod(p.key)}
            className={!hasRange && p.key === period ? "active" : ""}
            style={{ cursor: "pointer" }}
          >
            {p.label}
          </a>
        ))}
      </div>

      {/* Intervalo de datas + filtros */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
          marginTop: 6,
        }}
      >
        <div>
          <label>De</label>
          <input
            type="date"
            value={params.get("from") ?? ""}
            onChange={(e) => update({ from: e.target.value || null })}
          />
        </div>
        <div>
          <label>Até</label>
          <input
            type="date"
            value={params.get("until") ?? ""}
            onChange={(e) => update({ until: e.target.value || null })}
          />
        </div>
        <div>
          <label>Status</label>
          <select
            value={params.get("status") ?? ""}
            onChange={(e) => update({ status: e.target.value || null })}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Forma de pagamento</label>
          <select
            value={params.get("forma") ?? ""}
            onChange={(e) => update({ forma: e.target.value || null })}
          >
            {BILLING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Projeto</label>
          <select
            value={params.get("projeto") ?? ""}
            onChange={(e) => update({ projeto: e.target.value || null })}
          >
            {PROJECT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Origem</label>
          <select
            value={params.get("origem") ?? ""}
            onChange={(e) => update({ origem: e.target.value || null })}
          >
            {ORIGIN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Recorrência</label>
          <select
            value={params.get("rec") ?? ""}
            onChange={(e) => update({ rec: e.target.value || null })}
          >
            {RECURRING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Buscar doador</label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: q || null });
            }}
          >
            <input
              type="search"
              placeholder="nome, e-mail ou CPF/CNPJ"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </form>
        </div>
      </div>

      <div
        style={{
          marginTop: 10,
          display: "flex",
          gap: 16,
          alignItems: "center",
          fontSize: 13,
        }}
      >
        <a onClick={() => router.push("/")} style={{ cursor: "pointer" }}>
          Limpar filtros
        </a>
        <a
          onClick={togglePin}
          style={{ cursor: "pointer", color: "var(--muted)" }}
          title="Fixar a barra de filtros ao rolar a página"
        >
          {pinned ? "📌 Filtros fixados" : "📌 Fixar filtros"}
        </a>
        {isAdmin && (
          <a
            onClick={toggleReveal}
            style={{
              cursor: "pointer",
              color: revealed ? "var(--brand)" : "var(--muted)",
              fontWeight: 500,
            }}
            title="Apenas admin: mostrar/ocultar nomes completos dos doadores"
          >
            {revealed ? "👁 Dados revelados" : "🙈 Revelar dados"}
          </a>
        )}
      </div>
    </div>
  );
}
