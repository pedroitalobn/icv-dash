"use client";

import { useEffect, useState } from "react";

/** Alterna a largura do painel (contido ↔ largura total), persistindo no navegador. */
export function FullWidthToggle() {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const w = localStorage.getItem("icv-wide") === "1";
    setWide(w);
    document.body.classList.toggle("wide", w);
  }, []);

  function toggle() {
    const w = !wide;
    setWide(w);
    localStorage.setItem("icv-wide", w ? "1" : "0");
    document.body.classList.toggle("wide", w);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={wide ? "" : "btn-ghost"}
      title="Alternar largura total"
      aria-pressed={wide}
    >
      {wide ? "⇤⇥ Largura total" : "⇤⇥ Largura"}
    </button>
  );
}
