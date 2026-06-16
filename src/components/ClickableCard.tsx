"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

interface CardDetail {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: string[][];
  aligns?: ("left" | "right")[];
}

/** Card clicável: ao clicar, abre um modal com os dados detalhados (via /api/card). */
export function ClickableCard({
  card,
  children,
  className = "",
}: {
  card: string;
  children: ReactNode;
  className?: string;
}) {
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CardDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    setData(null);
    const sp = new URLSearchParams(params.toString());
    sp.set("card", card);
    fetch(`/api/card?${sp.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message ?? "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, [open, card, params]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div
        className={`card clickable ${className}`}
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(true)}
      >
        {children}
        <span className="card-expand" aria-hidden>
          ⤢
        </span>
      </div>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{data?.title ?? "Detalhe"}</h2>
                {data?.subtitle && <p className="muted">{data.subtitle}</p>}
              </div>
              <button className="btn-ghost" onClick={() => setOpen(false)}>
                Fechar ✕
              </button>
            </div>
            <div className="modal-body">
              {loading && <p className="muted">Carregando…</p>}
              {error && <p className="error">{error}</p>}
              {data && !loading && (
                <table>
                  <thead>
                    <tr>
                      {data.columns.map((c, i) => (
                        <th
                          key={c}
                          style={{ textAlign: data.aligns?.[i] === "right" ? "right" : "left" }}
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.length === 0 && (
                      <tr>
                        <td colSpan={data.columns.length} className="muted" style={{ textAlign: "center", padding: 24 }}>
                          Sem dados para os filtros atuais.
                        </td>
                      </tr>
                    )}
                    {data.rows.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            style={{
                              textAlign: data.aligns?.[ci] === "right" ? "right" : "left",
                              fontWeight: data.aligns?.[ci] === "right" ? 600 : 400,
                            }}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
