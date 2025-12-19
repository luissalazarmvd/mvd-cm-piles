"use client";

import { useEffect, useState } from "react";

const PASSWORD = "MVDML_123";

export default function Home() {
  const [authorized, setAuthorized] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");


  useEffect(() => {
    try {
      if (sessionStorage.getItem("mvd_auth") === "ok") {
        setAuthorized(true);
      }
    } catch {}
  }, []);


  useEffect(() => {
    if (!authorized) return;

    const containerId = "tradingview-widget";

    const initWidget = () => {
      const el = document.getElementById(containerId);

      if (!window.TradingView || !el) return;


      el.innerHTML = "";

 
      new window.TradingView.widget({
        container_id: containerId,


        symbol: "OANDA:XAUUSD",


        compare_symbols: [{ symbol: "OANDA:XAGUSD", position: "SameScale" }],

        interval: "D",
        theme: "dark",
        style: "1",
        locale: "en",
        width: "100%",
        height: 700,

        allow_symbol_change: true,
        studies: ["MACD@tv-basicstudies", "RSI@tv-basicstudies"],
      });
    };


    if (document.getElementById("tradingview-script")) {
      initWidget();
      return;
    }


    const script = document.createElement("script");
    script.id = "tradingview-script";
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = initWidget;

    document.body.appendChild(script);
  }, [authorized]);

  const handleLogin = () => {
    if (input === PASSWORD) {
      try {
        sessionStorage.setItem("mvd_auth", "ok");
      } catch {}
      setAuthorized(true);
      setError("");
    } else {
      setError("Contraseña incorrecta");
    }
  };

  const handleLogout = () => {
    try {
      sessionStorage.removeItem("mvd_auth");
    } catch {}
    setAuthorized(false);
    setInput("");
    setError("");
  };


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
          id="tradingview-widget"
          style={{
            width: "100%",
            height: 700,
            borderRadius: 8,
            overflow: "hidden",
            background: "#000",
          }}
        />

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
