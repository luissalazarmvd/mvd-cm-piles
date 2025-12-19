"use client";

import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    // Evita cargar el script más de una vez
    if (document.getElementById("tradingview-script")) return;

    const script = document.createElement("script");
    script.id = "tradingview-script";
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;

    script.onload = () => {
      // @ts-ignore
      new window.TradingView.widget({
        container_id: "tradingview-widget",
        symbol: "COMEX:GC1!",
        interval: "D",
        theme: "dark",
        style: "1",
        locale: "en",
        width: "100%",
        height: 500,
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
    <main style={{ padding: 16, fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ marginBottom: 12 }}>
        MVD – ML Dashboard (Market Data)
      </h1>

      {/* Power BI */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 8 }}>Power BI – Señales y ML</h2>

        <iframe
          title="Power BI Dashboard"
          src="https://app.powerbi.com/view?r=eyJrIjoiYzg4MDI3YjItMzNmYy00MTY0LTg5YzYtYWYzNjA0MTdhNmM0IiwidCI6IjYzNzhiZmNkLWRjYjktNDMwZi05Nzc4LWRiNTk3NGRjMmFkYyIsImMiOjR9"
          style={{
            width: "100%",
            height: "70vh",
            border: "none",
            borderRadius: 8,
          }}
          allowFullScreen
        />
      </section>

      {/* TradingView */}
      <section>
        <h2 style={{ marginBottom: 8 }}>Mercado – Oro / Índices</h2>
        <div id="tradingview-widget" />
      </section>
    </main>
  );
}
