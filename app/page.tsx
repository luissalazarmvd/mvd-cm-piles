"use client";

import React, { useEffect, useMemo, useState } from "react";

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
    .sort((a, b) => a.pile_code - b.pile_code || a.pile_type.localeCompare(b.pile_type));
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

  const COL_LABEL: Record<(typeof cols)[number], string> = {
    codigo: "Código",
    zona: "Zona",
    tmh: "TMH",
    humedad_pct: "Humedad (%)",
    tms: "TMS",
    au_gr_ton: "Au (g/t)",
    au_fino: "Au fino (g)",
    ag_gr_ton: "Ag (g/t)",
    ag_fino: "Ag fino (g)",
    cu_pct: "Cu (%)",
    nacn_kg_t: "NaCN (kg/t)",
    naoh_kg_t: "NaOH (kg/t)",
    rec_pct: "Rec (%)",
  };

  const tmsSum = rows.reduce((acc, r) => acc + n(r.tms), 0);
  const tmhSum = rows.reduce((acc, r) => acc + n(r.tmh), 0);

  const wSum = rows.reduce((acc, r) => acc + w(r), 0);
  const wavg = (get: (r: LotRow) => number) =>
    wSum > 0 ? rows.reduce((acc, r) => acc + w(r) * get(r), 0) / wSum : 0;

  const humW = wavg((r) => n(r.humedad_pct));
  const auW = wavg((r) => n(r.au_gr_ton));
  const agW = wavg((r) => n(r.ag_gr_ton));
  const cuW = wavg((r) => n(r.cu_pct));
  const nacnW = wavg((r) => n(r.nacn_kg_t));
  const naohW = wavg((r) => n(r.naoh_kg_t));
  const recW = wavg((r) => n(r.rec_pct));

  const auFinoSum = rows.reduce((acc, r) => acc + n(r.au_fino), 0);
  const agFinoSum = rows.reduce((acc, r) => acc + n(r.ag_fino), 0);

  const wrapStyle: React.CSSProperties = {
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,.25)",
    overflow: "auto",
    maxHeight: 420,
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
    background: "rgba(0,0,0,.28)",
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
                {COL_LABEL[c] ?? c}
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

/** Defaults (solo placeholder/hint en UI) */
const DEFAULTS = {
  lot_tmh_min: 0,
  var_tmh_min: 440,
  var_g_try: "20,24", // SOLO 1 PAR
  bat_tmh_target: 120,
  bat_lot_g_min: 70,
  reag_min: 6,
  reag_max: 8,
};

function numOrUndef(x: string): number | undefined {
  const s = (x ?? "").trim();
  if (!s) return undefined;
  const v = Number(s);
  return Number.isFinite(v) ? v : undefined;
}

function parseSinglePair(s: string): Array<[number, number]> | undefined {
  const raw = (s ?? "").trim();
  if (!raw) return undefined;
  const first = raw.split(";")[0]?.trim();
  if (!first) return undefined;

  const [a, b] = first.split(",").map((x) => x.trim());
  const gmin = Number(a);
  const gmax = Number(b);
  if (!Number.isFinite(gmin) || !Number.isFinite(gmax)) return undefined;

  return [[gmin, gmax]];
}

function buildSolverPayload(params: {
  lot_tmh_min: string;
  var_tmh_min: string;
  var_g_tries: string;
  bat_tmh_target: string;
  bat_lot_g_min: string;
  reag_min: string;
  reag_max: string;
}) {
  const payload: any = {};

  const lot_tmh_min = numOrUndef(params.lot_tmh_min);
  const var_tmh_min = numOrUndef(params.var_tmh_min);
  const var_g_tries = parseSinglePair(params.var_g_tries);

  const bat_tmh_target = numOrUndef(params.bat_tmh_target);
  const bat_lot_g_min = numOrUndef(params.bat_lot_g_min);

  const reag_min = numOrUndef(params.reag_min);
  const reag_max = numOrUndef(params.reag_max);

  if (lot_tmh_min !== undefined) payload.lot_tmh_min = lot_tmh_min;

  // solo mandar var_tmh_min y var_g_tries
  payload.varios = {};
  if (var_tmh_min !== undefined) payload.varios.var_tmh_min = var_tmh_min;
  if (var_g_tries !== undefined) payload.varios.var_g_tries = var_g_tries;
  if (Object.keys(payload.varios).length === 0) delete payload.varios;

  // solo mandar bat_tmh_target y bat_lot_g_min
  payload.batch = {};
  if (bat_tmh_target !== undefined) payload.batch.bat_tmh_target = bat_tmh_target;
  if (bat_lot_g_min !== undefined) payload.batch.bat_lot_g_min = bat_lot_g_min;
  if (Object.keys(payload.batch).length === 0) delete payload.batch;

  // reagentes
  payload.reagents = {};
  if (reag_min !== undefined) payload.reagents.reag_min = reag_min;
  if (reag_max !== undefined) payload.reagents.reag_max = reag_max;
  if (Object.keys(payload.reagents).length === 0) delete payload.reagents;

  return payload;
}

function InputRow({
  label,
  value,
  onChange,
  placeholder,
  hint,
  width = 220,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  width?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: width }}>
      <b style={{ fontSize: 13 }}>{label}</b>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: "10px 10px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,.25)",
          background: "rgba(0,0,0,.12)",
          color: "white",
          outline: "none",
          fontSize: 13,
        }}
      />
      {hint && <span style={{ fontSize: 12, color: "rgba(255,255,255,.70)" }}>{hint}</span>}
    </div>
  );
}

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

  // ===== Solo estos params =====
  const [lot_tmh_min, setLotTmhMin] = useState("");
  const [var_tmh_min, setVarTmhMin] = useState("");
  const [var_g_tries, setVarGTries] = useState("");
  const [bat_tmh_target, setBatTmhTarget] = useState("");
  const [bat_lot_g_min, setBatLotGMin] = useState("");
  const [reag_min, setReagMin] = useState("");
  const [reag_max, setReagMax] = useState("");

  const [calcLoading, setCalcLoading] = useState(false);
  const [calcMsg, setCalcMsg] = useState<string>("");

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

  async function runSolver() {
    setCalcLoading(true);
    setCalcMsg("");
    try {
      const payload = buildSolverPayload({
        lot_tmh_min,
        var_tmh_min,
        var_g_tries,
        bat_tmh_target,
        bat_lot_g_min,
        reag_min,
        reag_max,
      });

      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Error ejecutando solver");

      await loadAll();

      const inserted = j?.inserted;
      if (inserted) setCalcMsg(`OK: p1=${inserted?.p1 ?? 0}, p2=${inserted?.p2 ?? 0}, p3=${inserted?.p3 ?? 0}`);
      else setCalcMsg("OK");
    } catch (e: any) {
      setCalcMsg(`❌ ${e?.message || "Error"}`);
    } finally {
      setCalcLoading(false);
    }
  }

  useEffect(() => {
    if (!authorized) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      {/* Panel de parámetros + botón Calcular */}
      <section style={{
        background: "#004F86",
        padding: 12,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,.12)",
        marginBottom: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Parámetros</h2>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={runSolver}
              disabled={calcLoading}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "none",
                background: "#A7D8FF",
                color: "#003A63",
                fontWeight: 900,
                cursor: calcLoading ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {calcLoading ? "Calculando..." : "Calcular"}
            </button>

            {calcMsg && (
              <span style={{ fontWeight: 700, color: calcMsg.startsWith("❌") ? "#FFD6D6" : "rgba(255,255,255,.9)" }}>
                {calcMsg}
              </span>
            )}

            <span style={{ fontSize: 12, color: "rgba(255,255,255,.70)" }}>
              Si dejas vacío, usa el default.
            </span>
          </div>
        </div>

        <div style={{ height: 10 }} />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <InputRow
            label="TMH mínimo de Lote"
            value={lot_tmh_min}
            onChange={setLotTmhMin}
            placeholder={`${DEFAULTS.lot_tmh_min}`}
            hint="0 = no filtra"
          />

          <InputRow
            label="TMH mínimo de Pila"
            value={var_tmh_min}
            onChange={setVarTmhMin}
            placeholder={`${DEFAULTS.var_tmh_min}`}
          />

          <InputRow
            label="Ley Au Mínima y Máxima (g/t)"
            value={var_g_tries}
            onChange={setVarGTries}
            placeholder={DEFAULTS.var_g_try}
            hint='Formato: "20,24"'
            width={260}
          />

          <InputRow
            label="TMH de Batch"
            value={bat_tmh_target}
            onChange={setBatTmhTarget}
            placeholder={`${DEFAULTS.bat_tmh_target}`}
          />

          <InputRow
            label="Ley Au Mínima de Batch (g/t)"
            value={bat_lot_g_min}
            onChange={setBatLotGMin}
            placeholder={`${DEFAULTS.bat_lot_g_min}`}
          />

          <InputRow
            label="Consumo Mínimo de Reactivo (kg/t)"
            value={reag_min}
            onChange={setReagMin}
            placeholder={`${DEFAULTS.reag_min}`}
          />

          <InputRow
            label="Consumo Máximo de Reactivo (kg/t)"
            value={reag_max}
            onChange={setReagMax}
            placeholder={`${DEFAULTS.reag_max}`}
          />
        </div>
      </section>

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

        {current.length === 0 && <p style={{ color: "rgba(255,255,255,.85)" }}>Sin datos.</p>}
      </section>
    </main>
  );
}
