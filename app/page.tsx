"use client";

import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    if (document.getElementById("tradingview-script")) return;

    const script = document.createElement("script");
    script.id = "tradingview-script";
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;

    script.onload = () => {
      // @ts-ignore
new window.TradingView.widget({
  container_id: "tradingview-widget",

  // Activo principal (velas)
  symbol: "OANDA:XAUUSD",

  // Comparación (línea)
  compare_symbols: [
    {
      symbol: "OANDA:XAGUSD",
      position: "SameScale", // misma escala (como tu screenshot)
    },
  ],

  interval: "D",
  theme: "dark",
  style: "1",
  locale: "en",
  autosize: true,

  allow_symbol_change: true,

  studies: [
    "MACD@tv-basicstudies",
    "RSI@tv-basicstudies",
  ],
});

    };

    document.body.appendChild(script);
  }, []);

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
      {/* LOGO */}
      <img
        src="/logo_mvd.png"
        alt="MVD"
        style={{ height: 48, marginBottom: 16 }}
      />

      <h1 style={{ marginBottom: 12 }}>
        MVD – ML Dashboard (Market Data)
      </h1>

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
          style={{ borderRadius: 8, overflow: "hidden" }}
        />

        {/* Botón recomendado */}
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
