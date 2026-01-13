"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

// ✅ PDF export
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ✅ Excel export (SheetJS)
// npm i xlsx
import * as XLSX from "xlsx";

const PASSWORD = process.env.NEXT_PUBLIC_WEB_PASS || "";

const PBI_LOTES_URL =
  "https://app.powerbi.com/view?r=eyJrIjoiODg3NGQ5YWEtY2VjZS00ZWFiLTk3MjUtZjI4MzMxZmJkZDQxIiwidCI6IjYzNzhiZmNkLWRjYjktNDMwZi05Nzc4LWRiNTk3NGRjMmFkYyIsImMiOjR9";

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

  // ✅ nuevo (solo Resultado 4)
  rec_class?: string;

  loaded_at?: string;
  created_at?: string;
};

function n(x: any): number {
  const v = typeof x === "number" ? x : Number(x);
  return Number.isFinite(v) ? v : 0;
}

// ✅ separador miles con coma (12,686.51)
function fmt(x: any, d = 2) {
  const v = n(x);
  if (v === 0 && (x === null || x === undefined || x === "")) return "";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
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
  const tmsSum = rows.reduce((acc, r) => acc + n(r.tms), 0);
  const wSum = rows.reduce((acc, r) => acc + w(r), 0);

  const auWeighted = wSum > 0 ? rows.reduce((acc, r) => acc + w(r) * n(r.au_gr_ton), 0) / wSum : 0;
  const humWeighted = wSum > 0 ? rows.reduce((acc, r) => acc + w(r) * n(r.humedad_pct), 0) / wSum : 0;
  const recWeighted = wSum > 0 ? rows.reduce((acc, r) => acc + w(r) * n(r.rec_pct), 0) / wSum : 0;

  return { tmhSum, tmsSum, auWeighted, humWeighted, recWeighted };
}

const COLS = [
  "nro",
  "codigo",
  "zona",
  "tmh",
  "humedad_pct",
  "tms",
  "au_gr_ton",
  "au_fino",
  "ag_gr_ton",
  "ag_fino",
  "cu_pct",
  "nacn_kg_t",
  "naoh_kg_t",
  "rec_pct",
] as const;

const COLS_LOWREC = [
  "nro",
  "codigo",
  "zona",
  "tmh",
  "humedad_pct",
  "tms",
  "au_gr_ton",
  "au_fino",
  "ag_gr_ton",
  "ag_fino",
  "cu_pct",
  "nacn_kg_t",
  "naoh_kg_t",
  "rec_pct",
  "rec_class",
] as const;

type ColKey = (typeof COLS)[number];
type ColKeyLow = (typeof COLS_LOWREC)[number];

const COL_LABEL: Record<ColKey, string> = {
  nro: "#",
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

const COL_LABEL_LOWREC: Record<ColKeyLow, string> = {
  ...COL_LABEL,
  rec_class: "Clasificación",
};

function DataTable({ rows }: { rows: LotRow[] }) {
  const tmsSum = rows.reduce((acc, r) => acc + n(r.tms), 0);
  const tmhSum = rows.reduce((acc, r) => acc + n(r.tmh), 0);

  const wSum = rows.reduce((acc, r) => acc + w(r), 0);
  const wavg = (get: (r: LotRow) => number) => (wSum > 0 ? rows.reduce((acc, r) => acc + w(r) * get(r), 0) / wSum : 0);

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
            {COLS.map((c) => (
              <th key={c} style={thStyle}>
                {COL_LABEL[c] ?? c}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.id ?? i}`} style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
              <td style={tdStyle}>{i + 1}</td>
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
              <td colSpan={COLS.length} style={{ padding: "10px", color: "rgba(255,255,255,.75)" }}>
                Sin datos.
              </td>
            </tr>
          )}
        </tbody>

        {rows.length > 0 && (
          <tfoot>
            <tr>
              <td style={tfootTd} />
              <td style={tfootTd}>SUBTOTAL</td>
              <td style={{ ...tfootTd, fontWeight: 600, color: "rgba(255,255,255,.85)" }}>({rows.length} lotes)</td>

              <td style={tfootTd}>{fmt(tmhSum, 2)}</td>
              <td style={tfootTd}>{fmt(humW, 2)}</td>
              <td style={tfootTd}>{fmt(tmsSum, 2)}</td>

              <td style={tfootTd}>{fmt(auW, 2)}</td>
              <td style={tfootTd}>{fmt(auFinoSum, 2)}</td>

              <td style={tfootTd}>{fmt(agW, 2)}</td>
              <td style={tfootTd}>{fmt(agFinoSum, 2)}</td>

              <td style={tfootTd}>{fmt(cuW, 2)}</td>
              <td style={tfootTd}>{fmt(nacnW, 2)}</td>
              <td style={tfootTd}>{fmt(naohW, 2)}</td>
              <td style={tfootTd}>{fmt(recW, 2)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function DataTableLowRec({ rows }: { rows: LotRow[] }) {
  const tmsSum = rows.reduce((acc, r) => acc + n(r.tms), 0);
  const tmhSum = rows.reduce((acc, r) => acc + n(r.tmh), 0);

  const wSum = rows.reduce((acc, r) => acc + w(r), 0);
  const wavg = (get: (r: LotRow) => number) => (wSum > 0 ? rows.reduce((acc, r) => acc + w(r) * get(r), 0) / wSum : 0);

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
            {COLS_LOWREC.map((c) => (
              <th key={c} style={thStyle}>
                {COL_LABEL_LOWREC[c] ?? c}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.id ?? i}`} style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
              <td style={tdStyle}>{i + 1}</td>
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
              <td style={tdStyle}>{r.rec_class ?? ""}</td>
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td colSpan={COLS_LOWREC.length} style={{ padding: "10px", color: "rgba(255,255,255,.75)" }}>
                Sin datos.
              </td>
            </tr>
          )}
        </tbody>

        {rows.length > 0 && (
          <tfoot>
            <tr>
              <td style={tfootTd} />
              <td style={tfootTd}>SUBTOTAL</td>
              <td style={{ ...tfootTd, fontWeight: 600, color: "rgba(255,255,255,.85)" }}>({rows.length} lotes)</td>

              <td style={tfootTd}>{fmt(tmhSum, 2)}</td>
              <td style={tfootTd}>{fmt(humW, 2)}</td>
              <td style={tfootTd}>{fmt(tmsSum, 2)}</td>

              <td style={tfootTd}>{fmt(auW, 2)}</td>
              <td style={tfootTd}>{fmt(auFinoSum, 2)}</td>

              <td style={tfootTd}>{fmt(agW, 2)}</td>
              <td style={tfootTd}>{fmt(agFinoSum, 2)}</td>

              <td style={tfootTd}>{fmt(cuW, 2)}</td>
              <td style={tfootTd}>{fmt(nacnW, 2)}</td>
              <td style={tfootTd}>{fmt(naohW, 2)}</td>
              <td style={tfootTd}>{fmt(recW, 2)}</td>

              <td style={tfootTd} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

type ViewKey = "1" | "2" | "3" | "4";

/** Defaults (solo placeholder/hint en UI) */
const DEFAULTS = {
  lot_tms_min: 0, // ✅ ahora TMS
  lot_rec_min: 85, // ✅ default 85
  var_g_try: "20,24", // SOLO 1 PAR
  reag_min: 4,
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
  zonesSelected: string[];
  zonesAll: string[];

  lot_tms_min: string;
  lot_rec_min: string;
  var_g_tries: string;
  reag_min: string;
  reag_max: string;
}) {
  const payload: any = {};

  const lot_tms_min = numOrUndef(params.lot_tms_min);
  const lot_rec_min = numOrUndef(params.lot_rec_min);
  const var_g_tries = parseSinglePair(params.var_g_tries);

  const reag_min = numOrUndef(params.reag_min);
  const reag_max = numOrUndef(params.reag_max);

  // ✅ nuevos params: dentro de filters
  payload.filters = {};

  // ✅ zones: por defecto todas seleccionadas => NO enviar nada
  // si el usuario deselecciona algo => enviamos solo las seleccionadas
  const all = params.zonesAll ?? [];
  const sel = params.zonesSelected ?? [];
  const isAllSelected = all.length > 0 && sel.length === all.length;

  if (!isAllSelected && sel.length > 0) payload.filters.zones = sel;

  if (lot_tms_min !== undefined) payload.filters.lot_tms_min = lot_tms_min;
  if (lot_rec_min !== undefined) payload.filters.lot_rec_min = lot_rec_min;
  if (Object.keys(payload.filters).length === 0) delete payload.filters;

  payload.varios = {};
  if (var_g_tries !== undefined) payload.varios.var_g_tries = var_g_tries;
  if (Object.keys(payload.varios).length === 0) delete payload.varios;

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

// ====== selector zonas (dropdown con checkboxes) ======
function ZoneDropdown({
  zones,
  selected,
  onToggle,
  onSelectAll,
}: {
  zones: string[];
  selected: string[];
  onToggle: (z: string) => void;
  onSelectAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as any)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const allSelected = zones.length > 0 && selected.length === zones.length;

  const label =
    zones.length === 0 ? "Cargando..." : allSelected ? `Todas (${zones.length})` : `${selected.length} seleccionadas`;

  return (
    <div ref={boxRef} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 260 }}>
      <b style={{ fontSize: 13 }}>Zonas</b>

      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        style={{
          padding: "10px 10px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,.25)",
          background: "rgba(0,0,0,.12)",
          color: "white",
          fontSize: 13,
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
        title="Deselecciona una zona para filtrar"
      >
        <span>{label}</span>
        <span style={{ opacity: 0.9 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          style={{
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.25)",
            background: "rgba(0,0,0,.20)",
            padding: 10,
            maxHeight: 240,
            overflow: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <b style={{ fontSize: 12 }}>Seleccionar</b>
            <button
              type="button"
              onClick={onSelectAll}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,.25)",
                background: "rgba(255,255,255,.10)",
                color: "white",
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Todas
            </button>
          </div>

          {zones.map((z) => {
            const checked = selected.includes(z);
            return (
              <label
                key={z}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 6px",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <input type="checkbox" checked={checked} onChange={() => onToggle(z)} style={{ width: 16, height: 16 }} />
                <span style={{ fontSize: 13 }}>{z}</span>
              </label>
            );
          })}

          {zones.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,.70)" }}>Sin zonas.</div>}
        </div>
      )}

      <span style={{ fontSize: 12, color: "rgba(255,255,255,.70)" }}>Default: todas seleccionadas. Si quitas una, filtra.</span>
    </div>
  );
}

// ====== helpers para export ======
function pad2(x: number) {
  return String(x).padStart(2, "0");
}

function formatDDMMYYYY(d: Date) {
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function safeParseDate(s?: string) {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

function getPileDateFromRows(allRows: LotRow[]) {
  let best: Date | undefined;
  for (const r of allRows) {
    const d = safeParseDate(r.loaded_at) ?? safeParseDate(r.created_at);
    if (!d) continue;
    if (!best || d.getTime() > best.getTime()) best = d;
  }
  return best ?? new Date();
}

async function fetchImageAsDataURL(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar imagen: ${url}`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("No se pudo leer imagen"));
    fr.readAsDataURL(blob);
  });
}

async function getImageNaturalSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
    img.onerror = () => reject(new Error("No se pudo leer tamaño de imagen"));
    img.src = dataUrl;
  });
}

function addImageContain(params: {
  doc: jsPDF;
  dataUrl: string;
  x: number;
  y: number;
  maxW: number;
  maxH: number;
  naturalW: number;
  naturalH: number;
}) {
  const { doc, dataUrl, x, y, maxW, maxH, naturalW, naturalH } = params;

  if (!naturalW || !naturalH) return;

  const s = Math.min(maxW / naturalW, maxH / naturalH, 1);
  const ww = naturalW * s;
  const hh = naturalH * s;

  doc.addImage(dataUrl, "PNG", x, y, ww, hh);
}

// ✅ Totales para export: sumas (TMH/TMS/finos) y ponderados por TMS para lo demás
function totalsForExport(rows: LotRow[]) {
  const tmhSum = rows.reduce((acc, r) => acc + n(r.tmh), 0);
  const tmsSum = rows.reduce((acc, r) => acc + n(r.tms), 0);

  const wSum = rows.reduce((acc, r) => acc + w(r), 0);
  const wavg = (get: (r: LotRow) => number) => (wSum > 0 ? rows.reduce((acc, r) => acc + w(r) * get(r), 0) / wSum : 0);

  const humW = wavg((r) => n(r.humedad_pct));
  const auW = wavg((r) => n(r.au_gr_ton));
  const agW = wavg((r) => n(r.ag_gr_ton));
  const cuW = wavg((r) => n(r.cu_pct));
  const nacnW = wavg((r) => n(r.nacn_kg_t));
  const naohW = wavg((r) => n(r.naoh_kg_t));
  const recW = wavg((r) => n(r.rec_pct));

  const auFinoSum = rows.reduce((acc, r) => acc + n(r.au_fino), 0);
  const agFinoSum = rows.reduce((acc, r) => acc + n(r.ag_fino), 0);

  return {
    tmhSum,
    tmsSum,
    auFinoSum,
    agFinoSum,
    humW,
    auW,
    agW,
    cuW,
    nacnW,
    naohW,
    recW,
  };
}

function drawSignatures(doc: jsPDF, pageW: number, pageH: number, marginX: number, yLine: number) {
  const colW = (pageW - marginX * 2) / 3;
  const c1 = marginX + colW * 0.5;
  const c2 = marginX + colW * 1.5;
  const c3 = marginX + colW * 2.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  const line = "-------------------------------";

  const drawSigBlock = (cx: number, title1: string) => {
    doc.text(line, cx, yLine, { align: "center" });
    doc.text(title1, cx, yLine + 32, { align: "center" });
    doc.text("Minera Veta Dorada S.A.C.", cx, yLine + 46, { align: "center" });
  };

  drawSigBlock(c1, "Sub Gerencia de Planta");
  drawSigBlock(c2, "Supervisión de Cancha");
  drawSigBlock(c3, "Control de Minerales");
}

function groupLowRecByClass(rows: LotRow[]) {
  const map = new Map<string, LotRow[]>();
  for (const r of rows) {
    const k = (r.rec_class ?? "").trim() || "SIN CLASIFICACIÓN";
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }

  // Orden: intenta mantener un orden "lógico" si existe, si no alfabético
  const preferred = ["CRÍTICA", "CRITICA", "ALTA", "MEDIA", "BAJA", "SIN CLASIFICACIÓN"];
  const keys = Array.from(map.keys());
  keys.sort((a, b) => {
    const ia = preferred.findIndex((p) => p.toUpperCase() === a.toUpperCase());
    const ib = preferred.findIndex((p) => p.toUpperCase() === b.toUpperCase());
    const pa = ia === -1 ? 999 : ia;
    const pb = ib === -1 ? 999 : ib;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });

  return keys.map((k) => ({ rec_class: k, rows: map.get(k)! }));
}

// ====== EXCEL helpers ======
function sanitizeSheetName(name: string) {
  // Excel limita a 31 chars y prohíbe: : \ / ? * [ ]
  const cleaned = (name ?? "")
    .replace(/[:\\\/\?\*\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Hoja").slice(0, 31);
}

function setColWidths(ws: XLSX.WorkSheet, cols: Array<{ wch: number }>) {
  (ws as any)["!cols"] = cols;
}

function aoaToSheet(aoa: any[][]) {
  return XLSX.utils.aoa_to_sheet(aoa);
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
  const [r4, setR4] = useState<LotRow[]>([]); // ✅ baja recuperación

  const [view, setView] = useState<ViewKey>("1");

  // ===== ZONAS =====
  const [zonesAll, setZonesAll] = useState<string[]>([]);
  const [zonesSelected, setZonesSelected] = useState<string[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);

  // ===== Solo estos params =====
  const [lot_tms_min, setLotTmsMin] = useState("");
  const [lot_rec_min, setLotRecMin] = useState("");
  const [var_g_tries, setVarGTries] = useState("");
  const [reag_min, setReagMin] = useState("");
  const [reag_max, setReagMax] = useState("");

  const [calcLoading, setCalcLoading] = useState(false);
  const [calcMsg, setCalcMsg] = useState<string>("");

  // ✅ export state (separado)
  const [exportPdfLoading, setExportPdfLoading] = useState(false);
  const [exportExcelLoading, setExportExcelLoading] = useState(false);

  const [etlLoading, setEtlLoading] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("mvd_auth") === "ok") setAuthorized(true);
    } catch {}
  }, []);

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

  async function loadZones() {
    setZonesLoading(true);
    try {
      const res = await fetch("/api/zones", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Error cargando zonas");

      const z: string[] = Array.isArray(j?.zones) ? j.zones : [];
      setZonesAll(z);

      // ✅ default: todas seleccionadas
      setZonesSelected((prev) => {
        if (prev && prev.length > 0) {
          const setZ = new Set(z);
          const filtered = prev.filter((x) => setZ.has(x));
          return filtered.length > 0 ? filtered : z;
        }
        return z;
      });
    } catch {
      setZonesAll([]);
      setZonesSelected([]);
    } finally {
      setZonesLoading(false);
    }
  }

  async function runETL() {
    setEtlLoading(true);
    try {
      const res = await fetch("/api/etl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Error ejecutando ETL");

      await loadAll();

      alert(`✅ Lotes cargados: ${j?.inserted ?? "OK"}`);
    } catch (e: any) {
      alert(`❌ ${e?.message || "Error"}`);
    } finally {
      setEtlLoading(false);
    }
  }

  async function loadAll() {
    setLoading(true);
    setLoadError("");

    try {
      // 1) Siempre intenta cargar 1..3 (críticos)
      const [a, b, c] = await Promise.all([
        fetch("/api/pilas?which=1", { cache: "no-store" }),
        fetch("/api/pilas?which=2", { cache: "no-store" }),
        fetch("/api/pilas?which=3", { cache: "no-store" }),
      ]);

      const ja = await a.json().catch(() => ({}));
      const jb = await b.json().catch(() => ({}));
      const jc = await c.json().catch(() => ({}));

      if (!a.ok) throw new Error(ja?.error || "Error cargando resultado 1");
      if (!b.ok) throw new Error(jb?.error || "Error cargando resultado 2");
      if (!c.ok) throw new Error(jc?.error || "Error cargando resultado 3");

      setR1(Array.isArray(ja?.rows) ? ja.rows : []);
      setR2(Array.isArray(jb?.rows) ? jb.rows : []);
      setR3(Array.isArray(jc?.rows) ? jc.rows : []);

      // 2) Resultado 4 (NO crítico): si falla, NO borres los otros
      try {
        const d = await fetch("/api/pilas?which=4", { cache: "no-store" });
        const jd = await d.json().catch(() => ({}));
        if (!d.ok) {
          setR4([]);
        } else {
          setR4(Array.isArray(jd?.rows) ? jd.rows : []);
        }
      } catch {
        setR4([]);
      }
    } catch (e: any) {
      // Si falla 1..3 recién ahí sí es crítico
      setLoadError(e?.message || "Error");
      setR1([]);
      setR2([]);
      setR3([]);
      setR4([]);
    } finally {
      setLoading(false);
    }
  }

  async function runSolver() {
    setCalcLoading(true);
    setCalcMsg("");
    try {
      const payload = buildSolverPayload({
        zonesSelected,
        zonesAll,
        lot_tms_min,
        lot_rec_min,
        var_g_tries,
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

      const ins = j?.inserted;
      if (ins) {
        setCalcMsg(`OK: R1=${ins?.p1 ?? 0}, R2=${ins?.p2 ?? 0}, R3=${ins?.p3 ?? 0}, BR=${ins?.rej_lowrec ?? ins?.p4 ?? 0}`);
      } else {
        setCalcMsg("OK");
      }
    } catch (e: any) {
      setCalcMsg(`❌ ${e?.message || "Error"}`);
    } finally {
      setCalcLoading(false);
    }
  }

  useEffect(() => {
    if (!authorized) return;
    loadZones();
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  // ✅ toggle zonas (evita quedarse en 0 seleccionadas)
  function toggleZone(z: string) {
    setZonesSelected((prev) => {
      const has = prev.includes(z);
      if (has) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== z);
      }
      return [...prev, z];
    });
  }

  function selectAllZones() {
    setZonesSelected(zonesAll);
  }

  const g1 = useMemo(() => groupByPile(r1), [r1]);
  const g2 = useMemo(() => groupByPile(r2), [r2]);
  const g3 = useMemo(() => groupByPile(r3), [r3]);

  const current = view === "1" ? g1 : view === "2" ? g2 : view === "3" ? g3 : [];
  const flatCurrentRows = view === "1" ? r1 : view === "2" ? r2 : view === "3" ? r3 : r4;

  const viewTitle =
    view === "1"
      ? "Resultado 1 – 1 pila Varios"
      : view === "2"
      ? "Resultado 2 – Pilas Batch"
      : view === "3"
      ? "Resultado 3 – Mixto (1 Varios + 1 Batch)"
      : "Resultado 4 – Baja Recuperación";

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

  function addSignaturesBelowLastTable(params: {
    doc: jsPDF;
    drawHeader: () => void;
    pageW: number;
    pageH: number;
    marginX: number;
    headerH: number;
    titleOnNewPage?: string;
  }) {
    const { doc, drawHeader, pageW, pageH, marginX, headerH, titleOnNewPage } = params;

    let lastY = (doc as any).lastAutoTable?.finalY ?? headerH + 60;
    const needH = 120;
    const footerTopYMin = pageH - needH;

    if (lastY > footerTopYMin) {
      doc.addPage();
      drawHeader();
      if (titleOnNewPage) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(titleOnNewPage, marginX, headerH + 22);
      }
      lastY = headerH + 28;
    }

    const yLine = Math.max(lastY + 24, pageH - 95);
    drawSignatures(doc, pageW, pageH, marginX, yLine);
  }

  function addLowRecTable(params: {
    doc: jsPDF;
    drawHeader: () => void;
    title: string;
    rows: LotRow[];
    pageW: number;
    pageH: number;
    marginX: number;
    headerH: number;
    addPageBefore?: boolean;
  }) {
    const { doc, drawHeader, title, rows, pageW, pageH, marginX, headerH, addPageBefore } = params;

    if (addPageBefore) doc.addPage();
    drawHeader();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(title, marginX, headerH + 22);

    const head = [COLS_LOWREC.map((c) => COL_LABEL_LOWREC[c as ColKeyLow] ?? c)];

    const body = rows.map((r, i) => [
      String(i + 1), // ✅ enumeración reinicia desde 1
      r.codigo ?? "",
      r.zona ?? "",
      fmt(r.tmh, 2),
      fmt(r.humedad_pct, 2),
      fmt(r.tms, 2),
      fmt(r.au_gr_ton, 2),
      fmt(r.au_fino, 2),
      fmt(r.ag_gr_ton, 2),
      fmt(r.ag_fino, 2),
      fmt(r.cu_pct, 2),
      fmt(r.nacn_kg_t, 2),
      fmt(r.naoh_kg_t, 2),
      fmt(r.rec_pct, 2),
      r.rec_class ?? "",
    ]);

    const tot = totalsForExport(rows);

    autoTable(doc, {
      head,
      body,
      foot: [
        [
          "",
          "SUBTOTAL",
          `(${rows.length} lotes)`,
          fmt(tot.tmhSum, 2),
          fmt(tot.humW, 2),
          fmt(tot.tmsSum, 2),
          fmt(tot.auW, 2),
          fmt(tot.auFinoSum, 2),
          fmt(tot.agW, 2),
          fmt(tot.agFinoSum, 2),
          fmt(tot.cuW, 2),
          fmt(tot.nacnW, 2),
          fmt(tot.naohW, 2),
          fmt(tot.recW, 2),
          "",
        ],
      ],
      showFoot: "lastPage",
      startY: headerH + 36,
      margin: { left: marginX, right: marginX },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 3,
        lineWidth: 0.6,
        lineColor: [180, 180, 180],
      },
      headStyles: {
        fillColor: [0, 103, 172],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        lineWidth: 0.6,
        lineColor: [180, 180, 180],
      },
      footStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 103, 172],
        fontStyle: "bold",
        lineWidth: 0.6,
        lineColor: [180, 180, 180],
      },
    });

    addSignaturesBelowLastTable({
      doc,
      drawHeader,
      pageW,
      pageH,
      marginX,
      headerH,
      titleOnNewPage: `Firmas – ${title}`,
    });
  }

  // ✅ EXPORT PDF (solo la vista seleccionada: 1,2,3 o 4)
  async function exportCurrentToPDF() {
    setExportPdfLoading(true);
    try {
      const pileDate = getPileDateFromRows(flatCurrentRows);
      const dateStr = formatDDMMYYYY(pileDate);

      // logo: public/export_logo.png
      const logoDataUrl = await fetchImageAsDataURL("/export_logo.png").catch(() => "");
      const logoSize = logoDataUrl ? await getImageNaturalSize(logoDataUrl).catch(() => ({ w: 0, h: 0 })) : { w: 0, h: 0 };

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      const headerH = 60;
      const marginX = 28;

      const drawHeader = () => {
        if (logoDataUrl && logoSize.w > 0 && logoSize.h > 0) {
          addImageContain({
            doc,
            dataUrl: logoDataUrl,
            x: marginX,
            y: 12,
            maxW: 140,
            maxH: 40,
            naturalW: logoSize.w,
            naturalH: logoSize.h,
          });
        }

        const title = `Fecha de Pila: ${dateStr}`;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(title, pageW / 2, 34, { align: "center" });

        doc.setDrawColor(180);
        doc.setLineWidth(0.8);
        doc.line(marginX, headerH, pageW - marginX, headerH);
      };

      // ====== Caso: Resultado 4 (TOTAL + tablas por rec_class) ======
      if (view === "4") {
        if (!r4 || r4.length === 0) {
          alert("Sin datos para exportar.");
          return;
        }

        // 1) Tabla total (como ahora)
        addLowRecTable({
          doc,
          drawHeader,
          title: "Baja Recuperación (Total)",
          rows: r4,
          pageW,
          pageH,
          marginX,
          headerH,
          addPageBefore: false,
        });

        // 2) Tablas por categoría
        const groups = groupLowRecByClass(r4).filter((g) => g.rows.length > 0);

        for (const g of groups) {
          addLowRecTable({
            doc,
            drawHeader,
            title: `Baja Recuperación – ${g.rec_class}`,
            rows: g.rows,
            pageW,
            pageH,
            marginX,
            headerH,
            addPageBefore: true,
          });
        }

        const fname = `Export_BajaRec_${dateStr.replaceAll("/", "-")}.pdf`;
        doc.save(fname);
        return;
      }

      // ====== Caso: Resultados 1/2/3 (tablas por pila) ======
      const piles = current;
      if (!piles || piles.length === 0) {
        alert("Sin datos para exportar.");
        return;
      }

      const head = [COLS.map((c) => COL_LABEL[c as ColKey] ?? c)];

      const makeBodyRows = (rows: LotRow[]) =>
        rows.map((r, i) => [
          String(i + 1),
          r.codigo ?? "",
          r.zona ?? "",
          fmt(r.tmh, 2),
          fmt(r.humedad_pct, 2),
          fmt(r.tms, 2),
          fmt(r.au_gr_ton, 2),
          fmt(r.au_fino, 2),
          fmt(r.ag_gr_ton, 2),
          fmt(r.ag_fino, 2),
          fmt(r.cu_pct, 2),
          fmt(r.nacn_kg_t, 2),
          fmt(r.naoh_kg_t, 2),
          fmt(r.rec_pct, 2),
        ]);

      piles.forEach((p, idx) => {
        if (idx > 0) doc.addPage();

        drawHeader();

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(`Pila #${p.pile_code} (${p.pile_type})`, marginX, headerH + 22);

        const k = pileKPIs(p.lotes);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(
          `TMS=${fmt(k.tmsSum, 1)} | Au=${fmt(k.auWeighted, 2)} g/t | Hum=${fmt(k.humWeighted, 2)}% | Rec=${fmt(k.recWeighted, 2)}%`,
          marginX,
          headerH + 38
        );

        const tot = totalsForExport(p.lotes);

        autoTable(doc, {
          head,
          body: makeBodyRows(p.lotes),
          foot: [
            [
              "",
              "SUBTOTAL",
              `(${p.lotes.length} lotes)`,
              fmt(tot.tmhSum, 2),
              fmt(tot.humW, 2),
              fmt(tot.tmsSum, 2),
              fmt(tot.auW, 2),
              fmt(tot.auFinoSum, 2),
              fmt(tot.agW, 2),
              fmt(tot.agFinoSum, 2),
              fmt(tot.cuW, 2),
              fmt(tot.nacnW, 2),
              fmt(tot.naohW, 2),
              fmt(tot.recW, 2),
            ],
          ],
          showFoot: "lastPage",
          startY: headerH + 48,
          margin: { left: marginX, right: marginX },
          theme: "grid",
          styles: {
            font: "helvetica",
            fontSize: 8,
            cellPadding: 3,
            lineWidth: 0.6,
            lineColor: [180, 180, 180],
          },
          headStyles: {
            fillColor: [0, 103, 172],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            lineWidth: 0.6,
            lineColor: [180, 180, 180],
          },
          footStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 103, 172],
            fontStyle: "bold",
            lineWidth: 0.6,
            lineColor: [180, 180, 180],
          },
        });

        addSignaturesBelowLastTable({
          doc,
          drawHeader,
          pageW,
          pageH,
          marginX,
          headerH,
          titleOnNewPage: `Firmas – Pila #${p.pile_code} (${p.pile_type})`,
        });
      });

      const fname = `Export_${view === "1" ? "Resultado1" : view === "2" ? "Resultado2" : "Resultado3"}_${dateStr.replaceAll("/", "-")}.pdf`;
      doc.save(fname);
    } catch (e: any) {
      alert(e?.message || "Error exportando");
    } finally {
      setExportPdfLoading(false);
    }
  }

  // ✅ EXPORT EXCEL (misma lógica que PDF, sin firmas)
  async function exportCurrentToExcel() {
    setExportExcelLoading(true);
    try {
      const pileDate = getPileDateFromRows(flatCurrentRows);
      const dateStr = formatDDMMYYYY(pileDate);

      const wb = XLSX.utils.book_new();

      const headerRow = (cols: readonly string[], isLow = false) =>
        cols.map((c) => {
          if (isLow) return (COL_LABEL_LOWREC as any)[c] ?? c;
          return (COL_LABEL as any)[c] ?? c;
        });

      const buildSheetForRows = (params: { title: string; rows: LotRow[]; lowRec?: boolean; kpiText?: string }) => {
        const { title, rows, lowRec, kpiText } = params;

        const cols = lowRec ? (COLS_LOWREC as unknown as string[]) : (COLS as unknown as string[]);
        const head = headerRow(cols as any, !!lowRec);

        const aoa: any[][] = [];
        aoa.push(["Fecha de Pila", dateStr]);
        aoa.push([title]);
        if (kpiText) aoa.push([kpiText]);
        aoa.push([]);
        aoa.push(head);

        if (!rows || rows.length === 0) {
          aoa.push(["Sin datos."]);
        } else {
          rows.forEach((r, i) => {
            const base = [
              i + 1,
              r.codigo ?? "",
              r.zona ?? "",
              n(r.tmh),
              n(r.humedad_pct),
              n(r.tms),
              n(r.au_gr_ton),
              n(r.au_fino),
              n(r.ag_gr_ton),
              n(r.ag_fino),
              n(r.cu_pct),
              n(r.nacn_kg_t),
              n(r.naoh_kg_t),
              n(r.rec_pct),
            ];

            if (lowRec) {
              aoa.push([...base, (r.rec_class ?? "").toString()]);
            } else {
              aoa.push(base);
            }
          });

          const tot = totalsForExport(rows);

          const subtotalBase = [
            "",
            "SUBTOTAL",
            `(${rows.length} lotes)`,
            tot.tmhSum,
            tot.humW,
            tot.tmsSum,
            tot.auW,
            tot.auFinoSum,
            tot.agW,
            tot.agFinoSum,
            tot.cuW,
            tot.nacnW,
            tot.naohW,
            tot.recW,
          ];

          if (lowRec) aoa.push([...subtotalBase, ""]);
          else aoa.push(subtotalBase);
        }

        const ws = aoaToSheet(aoa);

        // Ancho de columnas (simple)
        const baseCols = [
          { wch: 6 }, // #
          { wch: 14 }, // código
          { wch: 16 }, // zona
          { wch: 12 }, // TMH
          { wch: 14 }, // Hum
          { wch: 12 }, // TMS
          { wch: 10 }, // Au g/t
          { wch: 14 }, // Au fino
          { wch: 10 }, // Ag g/t
          { wch: 14 }, // Ag fino
          { wch: 10 }, // Cu
          { wch: 14 }, // NaCN
          { wch: 14 }, // NaOH
          { wch: 10 }, // Rec
        ];
        const colsW = lowRec ? [...baseCols, { wch: 18 }] : baseCols;
        setColWidths(ws, colsW);

        return ws;
      };

      // ====== Caso: Resultado 4 (TOTAL + tablas por rec_class) ======
      if (view === "4") {
        if (!r4 || r4.length === 0) {
          alert("Sin datos para exportar.");
          return;
        }

        // Total
        XLSX.utils.book_append_sheet(
          wb,
          buildSheetForRows({
            title: "Baja Recuperación (Total)",
            rows: r4,
            lowRec: true,
          }),
          sanitizeSheetName("BajaRec Total")
        );

        // Por clasificación
        const groups = groupLowRecByClass(r4).filter((g) => g.rows.length > 0);
        for (const g of groups) {
          XLSX.utils.book_append_sheet(
            wb,
            buildSheetForRows({
              title: `Baja Recuperación – ${g.rec_class}`,
              rows: g.rows,
              lowRec: true,
            }),
            sanitizeSheetName(`BR ${g.rec_class}`)
          );
        }

        const fname = `Export_BajaRec_${dateStr.replaceAll("/", "-")}.xlsx`;
        XLSX.writeFile(wb, fname);
        return;
      }

      // ====== Caso: Resultados 1/2/3 (tablas por pila => 1 hoja por pila) ======
      const piles = current;
      if (!piles || piles.length === 0) {
        alert("Sin datos para exportar.");
        return;
      }

      for (const p of piles) {
        const k = pileKPIs(p.lotes);
        const kpiText = `TMS=${fmt(k.tmsSum, 1)} | Au=${fmt(k.auWeighted, 2)} g/t | Hum=${fmt(k.humWeighted, 2)}% | Rec=${fmt(k.recWeighted, 2)}%`;

        const sheetName = sanitizeSheetName(`Pila ${p.pile_code} ${p.pile_type}`);
        XLSX.utils.book_append_sheet(
          wb,
          buildSheetForRows({
            title: `Pila #${p.pile_code} (${p.pile_type})`,
            rows: p.lotes,
            lowRec: false,
            kpiText,
          }),
          sheetName
        );
      }

      const fname = `Export_${view === "1" ? "Resultado1" : view === "2" ? "Resultado2" : "Resultado3"}_${dateStr.replaceAll("/", "-")}.xlsx`;
      XLSX.writeFile(wb, fname);
    } catch (e: any) {
      alert(e?.message || "Error exportando Excel");
    } finally {
      setExportExcelLoading(false);
    }
  }

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
        <div style={{ background: "#004F86", padding: 32, borderRadius: 10, width: 340, textAlign: "center" }}>
          <img src="/logo_mvd.png" alt="MVD" style={{ height: 48, marginBottom: 16 }} />
          <h2 style={{ marginBottom: 16 }}>Acceso Control de Pilas</h2>

          <input
            type="password"
            placeholder="Contraseña"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLogin();
            }}
            style={{ width: "100%", padding: 10, borderRadius: 6, border: "none", marginBottom: 12, outline: "none" }}
          />

          <button
            onClick={handleLogin}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 6,
              border: "none",
              background: "#A7D8FF",
              color: "#003A63",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Ingresar
          </button>

          {error && <p style={{ color: "#FFD6D6", marginTop: 12 }}>{error}</p>}
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
            onClick={runETL}
            disabled={etlLoading}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: "#A7D8FF",
              color: "#003A63",
              fontWeight: "bold",
              cursor: etlLoading ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
            title="Carga stg_lotes_daily desde Google Sheets"
          >
            {etlLoading ? "Cargando..." : "Cargar lotes"}
          </button>

          {/* ✅ Exportar PDF (antes: Exportar) */}
          <button
            onClick={exportCurrentToPDF}
            disabled={exportPdfLoading}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: "#A7D8FF",
              color: "#003A63",
              fontWeight: "bold",
              cursor: exportPdfLoading ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
            title="Exporta SOLO el resultado seleccionado (tab actual) a PDF"
          >
            {exportPdfLoading ? "Exportando..." : "Exportar PDF"}
          </button>

          {/* ✅ NUEVO: Exportar Excel */}
          <button
            onClick={exportCurrentToExcel}
            disabled={exportExcelLoading}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: "#A7D8FF",
              color: "#003A63",
              fontWeight: "bold",
              cursor: exportExcelLoading ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
            title="Exporta SOLO el resultado seleccionado (tab actual) a Excel"
          >
            {exportExcelLoading ? "Exportando..." : "Exportar Excel"}
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

      {/* Universo de Lotes (Power BI) */}
      <section
        style={{
          background: "#004F86",
          padding: 12,
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,.12)",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Universo de Lotes (Control de Minerales)</h2>

          <a
            href={PBI_LOTES_URL}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#A7D8FF", fontWeight: 800, textDecoration: "underline" }}
            title="Abrir en nueva pestaña"
          >
            Abrir en Power BI
          </a>
        </div>

        <div style={{ height: 10 }} />

        <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,.15)" }}>
          <iframe
            src={PBI_LOTES_URL}
            title="Control de Minerales - Lotes Disponibles"
            width="100%"
            height={520}
            style={{ border: 0, display: "block", background: "white" }}
            allowFullScreen
          />
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,.70)" }}>Usa los filtros del reporte para validar el universo de lotes disponible.</div>
      </section>

      {/* Panel de parámetros + botón Calcular */}
      <section
        style={{
          background: "#004F86",
          padding: 12,
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,.12)",
          marginBottom: 14,
        }}
      >
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

            <span style={{ fontSize: 12, color: "rgba(255,255,255,.70)" }}>Si dejas vacío, usa el default.</span>
          </div>
        </div>

        <div style={{ height: 10 }} />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          {/* ✅ PRIMERO: selector de ZONAS */}
          <ZoneDropdown zones={zonesAll} selected={zonesSelected} onToggle={toggleZone} onSelectAll={selectAllZones} />

          <InputRow label="TMS mínimo de Lote" value={lot_tms_min} onChange={setLotTmsMin} placeholder={`${DEFAULTS.lot_tms_min}`} hint="0 = no filtra" />

          <InputRow
            label="Recuperación Mínima de Lote (%)"
            value={lot_rec_min}
            onChange={setLotRecMin}
            placeholder={`${DEFAULTS.lot_rec_min}`}
            hint="85"
            width={260}
          />

          <InputRow
            label="Ley Au Mínima y Máxima (g/t)"
            value={var_g_tries}
            onChange={setVarGTries}
            placeholder={DEFAULTS.var_g_try}
            hint='Formato: "20,24"'
            width={260}
          />

          <InputRow label="Consumo Mínimo de Reactivo (kg/t)" value={reag_min} onChange={setReagMin} placeholder={`${DEFAULTS.reag_min}`} />
          <InputRow label="Consumo Máximo de Reactivo (kg/t)" value={reag_max} onChange={setReagMax} placeholder={`${DEFAULTS.reag_max}`} />
        </div>

        {zonesLoading && <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,.70)" }}>Cargando zonas...</div>}
      </section>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {tabBtn("1", "Resultado 1")}
        {tabBtn("2", "Resultado 2")}
        {tabBtn("3", "Resultado 3")}
        {tabBtn("4", "Baja Recuperación")}
      </div>

      {loadError && <p style={{ color: "#FFD6D6", margin: "8px 0 14px 0" }}>❌ {loadError}</p>}

      <section style={{ marginBottom: 22 }}>
        <h2 style={{ margin: "0 0 10px 0" }}>{viewTitle}</h2>

        {/* ✅ Resultado 4 */}
        {view === "4" && (
          <div
            style={{
              marginBottom: 14,
              background: "#004F86",
              padding: 12,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.12)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
              <b>Baja Recuperación</b>
              <span style={{ color: "rgba(255,255,255,.85)" }}>({r4.length} lotes)</span>
            </div>

            <DataTableLowRec rows={r4} />
          </div>
        )}

        {/* ✅ Resultados 1/2/3 */}
        {view !== "4" &&
          current.map(({ pile_code, pile_type, lotes }) => {
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
                  <b>
                    Pila #{pile_code} ({pile_type})
                  </b>

                  <span style={{ color: "rgba(255,255,255,.85)" }}>
                    TMS={fmt(k.tmsSum, 1)} | Au={fmt(k.auWeighted, 2)} g/t | Hum={fmt(k.humWeighted, 2)}% | Rec={fmt(k.recWeighted, 2)}%
                  </span>
                </div>

                <DataTable rows={lotes} />
              </div>
            );
          })}

        {view !== "4" && current.length === 0 && <p style={{ color: "rgba(255,255,255,.85)" }}>Sin datos.</p>}
        {view === "4" && r4.length === 0 && <p style={{ color: "rgba(255,255,255,.85)" }}>Sin datos.</p>}
      </section>
    </main>
  );
}
