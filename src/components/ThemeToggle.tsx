"use client";

import { useEffect, useState } from "react";

/** Alterna entre tema claro e escuro, persistindo a escolha no navegador. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("icv-theme");
    const prefers =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const d = saved ? saved === "dark" : !!prefers;
    setDark(d);
    document.body.classList.toggle("dark", d);
  }, []);

  function toggle() {
    const d = !dark;
    setDark(d);
    localStorage.setItem("icv-theme", d ? "dark" : "light");
    document.body.classList.toggle("dark", d);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn-ghost"
      title={dark ? "Tema claro" : "Tema escuro"}
      aria-pressed={dark}
      style={{ padding: "7px 12px", fontSize: 15 }}
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
