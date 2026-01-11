"use client";

import { useEffect, useMemo, useState } from "react";

const PASSWORD = process.env.NEXT_PUBLIC_WEB_PASS || "";

type PileType = "batch" | "varios";

type LotRow = {
  id?: number;
  pile_code?: number;
  pile_type?: PileType;

  codigo?: string;
  zona?: string;

  tmh?: number | string;
  humedad_pct?: number | string;
  tms?: number | string;

  au_oz_tc?: number | string;
  au_gr_ton?: number | string;
  au_fino?: number | string;

  ag_oz_tc?: number | string;
  ag_gr_ton?: number | string;
  ag_fino?: number | string;

  cu_pct?: number | string;
  nacn_kg_t?: number | string;
  naoh_kg_t?: number | string;
  rec_pct?: number | string;

  loaded_at?: string;
  created_at?: string;
};

function n(x: any): number {
  const v = typeof x === "number" ? x : Number(x);
  return Number.isFinite(v) ? v : 0;
}

function fmt(x: any, d = 2) {
  const v = n(x);
  return v === 0 && (x === null || x === undefined || x === "") ? "" : v.toFixed(d);
}

function groupByPile(rows: LotRow[]) {
  const map = new Map<string, LotRow[]>();
  for (const r of rows) {
    const code = r.pile_code ?? 0;
    const type = (r.pile_type ?? "varios") as PileType;
    const k = `${code}__${type}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  return Array.from(map.entries())
    .map(([k, lotes]) => {
      const [pile_code_s, pile_type] = k.split("__");
      return { pile_code: Number(pile_code_s), pile_type: pile_type as PileType, lotes };
    })
    .sort((a, b) => (a.pile_code - b.pile_code) || a.pile_type.localeCompare(b.pile_type));
}

// peso para ponderados: prioriza TMS; si no hay, usa TMH
function w(r: LotRow) {
  const tms = n(r.tms);
  if (tms > 0) return tms;
  const tmh = n(r.tmh);
  return tmh > 0 ? tmh : 0;
}

function pileKPIs(rows: LotRow[]) {
  const tmhSum = rows.reduce((acc, r) => acc + n(r.tmh), 0);
  const wSum = rows.reduce((acc, r) => acc + w(r), 0);

  const auWeighted =
    wSum > 0 ? rows.reduce((acc, r) => acc + w(r) * n(r.au_gr_ton), 0) / wSum : 0;

  const humWeighted =
    wSum > 0 ? rows.reduce((acc, r) => acc + w(r) * n(r.humedad_pct), 0) / wSum : 0;

  // rec ponderada por Au_fino (si existe y >0), si no por w()
  const auFinesSum = rows.reduce((acc, r) => acc + n(r.au_fino), 0);
  const recWeighted =
    auFinesSum > 0
      ? rows.reduce((acc, r) => acc + n(r.au_fino) * n(r.rec_pct), 0) / auFinesSum
      : (wSum > 0 ? rows.reduce((acc, r) => acc + w(r) * n(r.rec_pct), 0) / wSum : 0);

  return { tmhSum, auWeighted, humWeighted, recWeighted };
}

function DataTable({ rows }: { rows: LotRow[] }) {
  const cols = [
    "codigo", "zona", "tmh", "humedad_pct", "tms",
    "au_gr_ton", "au_fino",
    "ag_gr_ton", "ag_fino",
    "cu_pct", "nacn_kg_t", "naoh_kg_t", "rec_pct",
  ] as const;

  const tmsSum = rows.reduce((acc, r) => acc + n(r.tms), 0);
  const tmhSum = rows.reduce((acc, r) => acc + n(r.tmh), 0);

  const wSum = rows.reduce((acc, r) => acc + w(r), 0);

  const wavg = (get: (r: LotRow) => number) =>
    wSum > 0 ? rows.reduce((acc, r) => acc + w(r) * get(r), 0) / wSum : 0;

  // ponderados por TMS (o TMH fallback)
  const humW = wavg((r) => n(r.humedad_pct));
  const auW = wavg((r) => n(r.au_gr_ton));
  const agW = wavg((r) => n(r.ag_gr_ton));
  const cuW = wavg((r) => n(r.cu_pct));
  const nacnW = wavg((r) => n(r.nacn_kg_t));
  const naohW = wavg((r) => n(r.naoh_kg_t));
  const recW = wavg((r) => n(r.rec_pct));

  // finos: suma directa
  const auFinoSum = rows.reduce((acc, r) => acc + n(r.au_fino), 0);
  const agFinoSum = rows.reduce((acc, r) => acc + n(r.ag_fino), 0);

  // styles
  const wrapStyle: React.CSSProperties = {
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,.25)",
    overflow: "auto",
    maxHeight: 420, // 👈 para que exista scroll y el TOTAL sticky tenga sentido
    background: "rgba(0,0,0,.10)",
  };

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 10px",
    borderBottom: "1px solid rgba(255,255,255,.2)",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 3,
    background: "rgba(0,0,0,.28)", // header sticky aesthetic
    backdropFilter: "blur(6px)",
  };

  const tdStyle: React.CSSProperties = { padding: "8px 10px", whiteSpace: "nowrap" };

  const tfootTd: React.CSSProperties = {
    padding: "10px 10px",
    fontWeight: 700,
    whiteSpace: "nowrap",
    position: "sticky",
    bottom: 0,
    zIndex: 2,
    background: "rgba(0,0,0,.30)",
    backdropFilter: "blur(6px)",
    borderTop: "1px solid rgba(255,255,255,.25)",
  };

  return (
    <div style={wrapStyle}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} style={thStyle}>
                {c}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.id ?? i}`} style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
              <td style={tdStyle}>{r.codigo ?? ""}</td>
              <td style={tdStyle}>{r.zona ?? ""}</td>
              <td style={tdStyle}>{fmt(r.tmh, 2)}</td>
              <td style={tdStyle}>{fmt(r.humedad_pct, 2)}</td>
              <td style={tdStyle}>{fmt(r.tms, 2)}</td>
              <td style={tdStyle}>{fmt(r.au_gr_ton, 2)}</td>
              <td style={tdStyle}>{fmt(r.au_fino, 2)}</td>
              <td style={tdStyle}>{fmt(r.ag_gr_ton, 2)}</td>
              <td style={tdStyle}>{fmt(r.ag_fino, 2)}</td>
              <td style={tdStyle}>{fmt(r.cu_pct, 2)}</td>
              <td style={tdStyle}>{fmt(r.nacn_kg_t, 2)}</td>
              <td style={tdStyle}>{fmt(r.naoh_kg_t, 2)}</td>
              <td style={tdStyle}>{fmt(r.rec_pct, 2)}</td>
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length} style={{ padding: "10px", color: "rgba(255,255,255,.75)" }}>
                Sin datos.
              </td>
            </tr>
          )}
        </tbody>

        {/* SUBTOTALES (sticky abajo) */}
        {rows.length > 0 && (
          <tfoot>
            <tr>
              <td style={tfootTd}>TOTAL</td>
              <td style={{ ...tfootTd, fontWeight: 600, color: "rgba(255,255,255,.85)" }}>
                ({rows.length} lotes)
              </td>

              <td style={tfootTd}>{tmhSum.toFixed(2)}</td>
              <td style={tfootTd}>{humW.toFixed(2)}</td>
              <td style={tfootTd}>{tmsSum.toFixed(2)}</td>

              <td style={tfootTd}>{auW.toFixed(2)}</td>
              <td style={tfootTd}>{auFinoSum.toFixed(2)}</td>

              <td style={tfootTd}>{agW.toFixed(2)}</td>
              <td style={tfootTd}>{agFinoSum.toFixed(2)}</td>

              <td style={tfootTd}>{cuW.toFixed(2)}</td>
              <td style={tfootTd}>{nacnW.toFixed(2)}</td>
              <td style={tfootTd}>{naohW.toFixed(2)}</td>
              <td style={tfootTd}>{recW.toFixed(2)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

type ViewKey = "1" | "2" | "3";

export default function Home() {
  const [authorized, setAuthorized] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [r1, setR1] = useState<LotRow[]>([]);
  const [r2, setR2] = useState<LotRow[]>([]);
  const [r3, setR3] = useState<LotRow[]>([]);

  const [view, setView] = useState<ViewKey>("1");

  useEffect(() => {
    try {
      if (sessionStorage.getItem("mvd_auth") === "ok") setAuthorized(true);
    } catch {}
  }, []);

  const handleLogin = () => {
    if (input === PASSWORD) {
      try { sessionStorage.setItem("mvd_auth", "ok"); } catch {}
      setAuthorized(true);
      setError("");
    } else {
      setError("Contraseña incorrecta");
    }
  };

  const handleLogout = () => {
    try { sessionStorage.removeItem("mvd_auth"); } catch {}
    setAuthorized(false);
    setInput("");
    setError("");
  };

  async function loadAll() {
    setLoading(true);
    setLoadError("");
    try {
      const [a, b, c] = await Promise.all([
        fetch("/api/pilas?which=1", { cache: "no-store" }),
        fetch("/api/pilas?which=2", { cache: "no-store" }),
        fetch("/api/pilas?which=3", { cache: "no-store" }),
      ]);

      const ja = await a.json();
      const jb = await b.json();
      const jc = await c.json();

      if (!a.ok) throw new Error(ja?.error || "Error cargando resultado 1");
      if (!b.ok) throw new Error(jb?.error || "Error cargando resultado 2");
      if (!c.ok) throw new Error(jc?.error || "Error cargando resultado 3");

      setR1(Array.isArray(ja?.rows) ? ja.rows : []);
      setR2(Array.isArray(jb?.rows) ? jb.rows : []);
      setR3(Array.isArray(jc?.rows) ? jc.rows : []);
    } catch (e: any) {
      setLoadError(e?.message || "Error");
      setR1([]); setR2([]); setR3([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authorized) return;
    loadAll();
  }, [authorized]);

  const g1 = useMemo(() => groupByPile(r1), [r1]);
  const g2 = useMemo(() => groupByPile(r2), [r2]);
  const g3 = useMemo(() => groupByPile(r3), [r3]);

  const current = view === "1" ? g1 : view === "2" ? g2 : g3;

  const viewTitle =
    view === "1"
      ? "Resultado 1 – 1 pila Varios"
      : view === "2"
        ? "Resultado 2 – Pilas Batch"
        : "Resultado 3 – Mixto (1 Varios + 1 Batch)";

  const tabBtn = (k: ViewKey, label: string) => {
    const active = view === k;
    return (
      <button
        key={k}
        onClick={() => setView(k)}
        style={{
          padding: "8px 12px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,.25)",
          background: active ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.10)",
          color: "white",
          fontWeight: 700,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </button>
    );
  };

  if (!authorized) {
    return (
      <main style={{
        minHeight: "100vh",
        backgroundColor: "#0067AC",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Arial, sans-serif",
        color: "white",
        padding: 16,
      }}>
        <div style={{ background: "#004F86", padding: 32, borderRadius: 10, width: 340, textAlign: "center" }}>
          <img src="/logo_mvd.png" alt="MVD" style={{ height: 48, marginBottom: 16 }} />
          <h2 style={{ marginBottom: 16 }}>Acceso Control de Pilas</h2>

          <input
            type="password"
            placeholder="Contraseña"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
            style={{ width: "100%", padding: 10, borderRadius: 6, border: "none", marginBottom: 12, outline: "none" }}
          />

          <button
            onClick={handleLogin}
            style={{ width: "100%", padding: 10, borderRadius: 6, border: "none", background: "#A7D8FF", color: "#003A63", fontWeight: "bold", cursor: "pointer" }}
          >
            Ingresar
          </button>

          {error && <p style={{ color: "#FFD6D6", marginTop: 12 }}>{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main style={{
      padding: 16,
      fontFamily: "Arial, sans-serif",
      backgroundColor: "#0067AC",
      color: "white",
      minHeight: "100vh",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo_mvd.png" alt="MVD" style={{ height: 48 }} />
          <h1 style={{ margin: 0 }}>MVD – Calculadora de Blending</h1>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={loadAll}
            disabled={loading}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: "#A7D8FF",
              color: "#003A63",
              fontWeight: "bold",
              cursor: loading ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {loading ? "Cargando..." : "Actualizar"}
          </button>

          <button
            onClick={handleLogout}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
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
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {tabBtn("1", "Resultado 1")}
        {tabBtn("2", "Resultado 2")}
        {tabBtn("3", "Resultado 3")}
      </div>

      {loadError && <p style={{ color: "#FFD6D6", margin: "8px 0 14px 0" }}>❌ {loadError}</p>}

      <section style={{ marginBottom: 22 }}>
        <h2 style={{ margin: "0 0 10px 0" }}>{viewTitle}</h2>

        {current.map(({ pile_code, pile_type, lotes }) => {
          const k = pileKPIs(lotes);
          return (
            <div
              key={`${pile_code}-${pile_type}`}
              style={{
                marginBottom: 14,
                background: "#004F86",
                padding: 12,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,.12)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                <b>Pila #{pile_code} ({pile_type})</b>
                <span style={{ color: "rgba(255,255,255,.85)" }}>
                  TMH={k.tmhSum.toFixed(1)} | Au={k.auWeighted.toFixed(2)} g/t | Hum={k.humWeighted.toFixed(2)}% | Rec={k.recWeighted.toFixed(2)}%
                </span>
              </div>
              <DataTable rows={lotes} />
            </div>
          );
        })}

        {current.length === 0 && (
          <p style={{ color: "rgba(255,255,255,.85)" }}>Sin datos.</p>
        )}
      </section>
    </main>
  );
}