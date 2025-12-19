"use client";

import { useEffect, useState } from "react";

const PASSWORD = "MVDML_123";

export default function Home() {
  const [authorized, setAuthorized] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  // 1) Mantener sesión
  useEffect(() => {
    try {
      if (localStorage.getItem("mvd_auth") === "ok") setAuthorized(true);
    } catch {}
  }, []);

  const handleLogin = () => {
    if (input === PASSWORD) {
      try {
        localStorage.setItem("mvd_auth", "ok");
      } catch {}
      setAuthorized(true);
      setError("");
    } else {
      setError("Contraseña incorrecta");
    }
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem("mvd_auth");
    } catch {}
    setAuthorized(false);
    setInput("");
    setError("");
  };

  // 2) Inyectar TradingView embed (XAUUSD + XAGUSD)
  useEffect(() => {
    if (!authorized) return;

    const containerId = "tv-advanced-widget";
    const container = document.getElementById(containerId);
    if (!container) return;

    // Limpia por si React re-renderiza
    container.innerHTML = "";

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;

    // IMPORTANTE: aquí va la comparación por default (symbols)
    script.innerHTML = JSON.stringify({
      autosize: true,
      theme: "dark",
      locale: "en",

      // Lista de símbolos (esto sí deja la comparación por default)
      symbols: [
        ["Oro", "OANDA:XAUUSD|1D"],
        ["Plata", "OANDA:XAGUSD|1D"],
      ],

      interval: "D",
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: true,
      save_image: true,
      calendar: false,
      support_host: "https://www.tradingview.com",
      studies: ["MACD@tv-basicstudies", "RSI@tv-basicstudies"],
    });

    container.appendChild(script);
  }, [authorized]);

  // LOGIN UI
  if (!authorized) {
    return (
      <main
        style={{
          minHeight: "100vh",
          backgroundColor: "#0067AC",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontFamily: "Arial, sans-serif",
          color: "white",
          padding: 16,
        }}
      >
        <div
          style={{
            background: "#004F86",
            padding: 32,
            borderRadius: 8,
            width: 340,
            textAlign: "center",
          }}
        >
          <img
            src="/logo_mvd.png"
            alt="MVD"
            style={{ height: 48, marginBottom: 16 }}
          />

          <h2 style={{ marginBottom: 16 }}>Acceso MVD</h2>

          <input
            type="password"
            placeholder="Contraseña"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLogin();
            }}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 4,
              border: "none",
              marginBottom: 12,
              outline: "none",
            }}
          />

          <button
            onClick={handleLogin}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 4,
              border: "none",
              background: "#A7D8FF",
              color: "#003A63",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Ingresar
          </button>

          {error && (
            <p style={{ color: "#FFD6D6", marginTop: 12 }}>{error}</p>
          )}
        </div>
      </main>
    );
  }

  // DASHBOARD UI
  return (
    <main
      style={{
        padding: 16,
        fontFamily: "Arial, sans-serif",
        backgroundColor: "#0067AC",
        color: "white",
        minHeight: "100vh",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo_mvd.png" alt="MVD" style={{ height: 48 }} />
          <h1 style={{ margin: 0 }}>MVD – ML Dashboard (Market Data)</h1>
        </div>

        <button
          onClick={handleLogout}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "none",
            background: "#A7D8FF",
            color: "#003A63",
            fontWeight: "bold",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Cerrar sesión
        </button>
      </div>

      {/* Power BI */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ marginBottom: 8 }}>Power BI – Señales y ML</h2>

        <iframe
          title="Power BI Dashboard"
          src="https://app.powerbi.com/view?r=eyJrIjoiYzg4MDI3YjItMzNmYy00MTY0LTg5YzYtYWYzNjA0MTdhNmM0IiwidCI6IjYzNzhiZmNkLWRjYjktNDMwZi05Nzc4LWRiNTk3NGRjMmFkYyIsImMiOjR9"
          style={{
            width: "100%",
            height: "70vh",
            border: "none",
            borderRadius: 8,
            background: "white",
          }}
          allowFullScreen
        />
      </section>

      {/* TradingView */}
      <section>
        <h2 style={{ marginBottom: 8 }}>Mercado – Oro / Índices</h2>

        <div
          style={{
            width: "100%",
            height: 700,
            borderRadius: 8,
            overflow: "hidden",
            background: "#000",
          }}
        >
          <div
            id="tv-advanced-widget"
            style={{ width: "100%", height: "100%" }}
          />
        </div>

        <a
          href="https://www.tradingview.com/chart/?symbol=OANDA:XAUUSD"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            marginTop: 10,
            color: "#A7D8FF",
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          Abrir en TradingView (análisis completo)
        </a>
      </section>
    </main>
  );
}
