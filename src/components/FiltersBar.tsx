"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  PERIOD_OPTIONS,
  STATUS_OPTIONS,
  BILLING_OPTIONS,
  RECURRING_OPTIONS,
} from "@/lib/filters";

export function FiltersBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

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
    <div className="card" style={{ marginBottom: 16 }}>
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

      <div style={{ marginTop: 10 }}>
        <a
          onClick={() => router.push("/")}
          style={{ cursor: "pointer", fontSize: 13 }}
        >
          Limpar filtros
        </a>
      </div>
    </div>
  );
}
