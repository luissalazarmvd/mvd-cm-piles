"use client";

import { useEffect, useState } from "react";

const PASSWORD = "MVDML_123";

type CommentLegacy = {
  headline?: string;
  bullets?: string[];
  interpretation?: string;
  risks?: string[];
  confidence?: "Baja" | "Media" | "Alta" | string;
};

type CommentSimple = {
  titulo?: string;
  comentario?: string;
  riesgos?: string; // "Riesgos: a; b"
  confianza?: "Baja" | "Media" | "Alta" | string;
};

// el API puede devolver cualquiera
type CommentJSON = CommentLegacy | CommentSimple;

export default function Home() {
  const [authorized, setAuthorized] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  // Comentario IA
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState<string>("");
  const [aiComment, setAiComment] = useState<CommentJSON | null>(null);
  const [aiProb, setAiProb] = useState<number | null>(null);

  async function loadAIComment() {
    setAiLoading(true);
    setAiError("");
    try {
      const res = await fetch("/api/comment", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Error");
      const probRaw = j?.probability ?? j?.snapshot?.scenarios?.probability;
const prob = typeof probRaw === "number" ? probRaw : Number(probRaw);
setAiProb(Number.isFinite(prob) ? prob : null);



      // Preferir el formato nuevo si existe; sino el legacy
      setAiComment(j.comment_simple ?? j.comment ?? null);
    } catch (e: any) {
      setAiError(e?.message || "Error");
      setAiComment(null);
    } finally {
      setAiLoading(false);
    }
  }

  // 1) Mantener sesión (solo corre en cliente)
  useEffect(() => {
    try {
      if (sessionStorage.getItem("mvd_auth") === "ok") {
        setAuthorized(true);
      }
    } catch {}
  }, []);

  // 1.1) Cargar comentario IA cuando está autorizado
  useEffect(() => {
    if (!authorized) return;
    loadAIComment();
  }, [authorized]);

  // 2) Cargar TradingView SOLO cuando ya está autorizado
  useEffect(() => {
    if (!authorized) return;

    const containerId = "tradingview-widget";

    const initWidget = () => {
      const el = document.getElementById(containerId);
      // @ts-ignore
      if (!window.TradingView || !el) return;

      // Evita duplicados si React re-renderiza
      el.innerHTML = "";

      // @ts-ignore
      new window.TradingView.widget({
        container_id: containerId,

        // Principal
        symbol: "OANDA:XAUUSD",

        // Comparación por default
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

    // Si ya existe el script, solo inicializa
    if (document.getElementById("tradingview-script")) {
      initWidget();
      return;
    }

    // Si no existe, lo creas
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
      <section style={{ marginBottom: 18 }}>
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

      {/* Comentario */}
      <section style={{ marginBottom: 28 }}>
        <div
          style={{
            borderRadius: 8,
            border: "2px solid #c69214",
            background: "#004F86",
            padding: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 10,
            }}
          >
            <h2 style={{ margin: 0 }}>Comentario (Macro + Señal + Forecast)</h2>

            <button
              onClick={loadAIComment}
              disabled={aiLoading}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "none",
                background: "#A7D8FF",
                color: "#003A63",
                fontWeight: "bold",
                cursor: aiLoading ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {aiLoading ? "Generando..." : "Actualizar"}
            </button>
          </div>

          {aiError && (
            <p style={{ color: "#FFD6D6", margin: 0 }}>❌ {aiError}</p>
          )}

          {!aiError && aiLoading && (
            <p style={{ margin: 0, color: "#D8EEFF" }}>
              Generando comentario con IA…
            </p>
          )}

          {!aiError && !aiLoading && aiComment && (() => {
            const c: any = aiComment;

            // title: legacy.headline || simple.titulo
            const title =
              (typeof c?.headline === "string" && c.headline.trim()) ? c.headline :
              (typeof c?.titulo === "string" && c.titulo.trim()) ? c.titulo :
              "Comentario IA";

            // main: legacy.interpretation || simple.comentario
            const mainText =
              (typeof c?.interpretation === "string" && c.interpretation.trim()) ? c.interpretation :
              (typeof c?.comentario === "string" && c.comentario.trim()) ? c.comentario :
              "";

            // bullets: legacy only
            const bullets = Array.isArray(c?.bullets) ? c.bullets : [];

            // risks: legacy.risks[] or simple.riesgos string
            const risksArr = Array.isArray(c?.risks)
              ? c.risks
              : (typeof c?.riesgos === "string"
                  ? c.riesgos
                      .replace(/^Riesgos:\s*/i, "")
                      .split(";")
                      .map((s: string) => s.trim())
                      .filter(Boolean)
                  : []);

            // confidence: legacy.confidence || simple.confianza
            const conf =
              (c?.confidence === "Baja" || c?.confidence === "Media" || c?.confidence === "Alta") ? c.confidence :
              (c?.confianza === "Baja" || c?.confianza === "Media" || c?.confianza === "Alta") ? c.confianza :
              "Baja";

            return (
              <div style={{ marginTop: 8 }}>
                <h3 style={{ margin: "0 0 8px 0" }}>{title}</h3>

                {bullets.length > 0 && (
                  <ul style={{ margin: "0 0 10px 18px" }}>
                    {bullets.map((b: string, i: number) => (
                      <li key={i} style={{ marginBottom: 6 }}>
                        {b}
                      </li>
                    ))}
                  </ul>
                )}

                {mainText && (
                  <p style={{ margin: "0 0 8px 0" }}>
                    <b>Comentario:</b> {mainText}
                  </p>
                )}

                {risksArr.length > 0 && (
                  <p style={{ margin: "0 0 8px 0" }}>
                    <b>Riesgos:</b> {risksArr.join(" · ")}
                  </p>
                )}

                <p style={{ margin: 0 }}>
                <b>Confianza:</b> {conf}
                {aiProb != null
                ? ` (prob=${(aiProb * 100).toFixed(1)}%)`
                : " (prob=sin dato)"}
                </p>

              </div>
            );
          })()}
        </div>

        <p style={{ marginTop: 10, fontSize: 12, color: "#D8EEFF" }}>
          Nota: comentario automático basado en datos del modelo (z-score, señal,
          probabilidad, VIX/DXY/Y10 y forecast de Au). Con tecnología de OpenAI.
        </p>
      </section>

      {/* TradingView */}
      <section style={{ marginBottom: 28 }}>
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

      {/* Matriz señal - confianza - acción */}
      <section style={{ marginTop: 18 }}>
        <h2 style={{ marginBottom: 10 }}>Matriz señal – confianza – acción</h2>

        <div
          style={{
            width: "100%",
            borderRadius: 8,
            overflow: "hidden",
            border: "2px solid #c69214",
            background: "#0067ac",
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 170px 1fr 1.2fr",
              gap: 0,
              borderBottom: "2px solid #c69214",
              fontWeight: 700,
              padding: "12px 12px",
            }}
          >
            <div>Señal</div>
            <div>Nivel de Confianza</div>
            <div>Interpretación</div>
            <div>Acción recomendada</div>
          </div>

          {/* Row -1 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 170px 1fr 1.2fr",
              gap: 0,
              padding: "14px 12px",
              borderBottom: "1px solid #c69214",
              alignItems: "center",
            }}
          >
            <div style={{ fontWeight: 700 }}>-1</div>
            <div style={{ fontWeight: 700 }}>{">"}60%</div>
            <div>Mercado desfavorable / riesgo elevado</div>
            <div>Aumentar castigos de negociación y reducir exposición</div>
          </div>

          {/* Row 0 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 170px 1fr 1.2fr",
              gap: 0,
              padding: "14px 12px",
              borderBottom: "1px solid #c69214",
              alignItems: "center",
            }}
          >
            <div style={{ fontWeight: 700 }}>0</div>
            <div style={{ fontWeight: 700 }}>-</div>
            <div>Sin señal clara</div>
            <div>Mantener condiciones estándar</div>
          </div>

          {/* Row 1 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 170px 1fr 1.2fr",
              gap: 0,
              padding: "14px 12px",
              alignItems: "center",
            }}
          >
            <div style={{ fontWeight: 700 }}>1</div>
            <div style={{ fontWeight: 700 }}>{">"}60%</div>
            <div>Mercado favorable / riesgo controlado</div>
            <div>Ofrecer condiciones más competitivas para captar volumen</div>
          </div>
        </div>

        {/* Nota opcional (chiquita) */}
        <p style={{ marginTop: 10, fontSize: 12, color: "#D8EEFF" }}>
          Nota: el umbral de confianza se interpreta como probabilidad mínima
          recomendada para ejecutar la acción.
        </p>
      </section>
    </main>
  );
}
