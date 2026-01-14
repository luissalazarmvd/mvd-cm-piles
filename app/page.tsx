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
type ViewKey = "1" | "2" | "3" | "4";

type LotRow = {
  // ✅ internal key for selection
  _k?: string;

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

function parseNum(x: any): number | undefined {
  if (x === null || x === undefined || x === "") return undefined;
  if (typeof x === "number") return Number.isFinite(x) ? x : undefined;

  let s = String(x).trim();
  if (!s) return undefined;

  // si tiene , y . decidir cuál es decimal por la última aparición
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // 12,686.51  -> decimal = dot  => quitar comas
    // 12.686,51  -> decimal = comma=> quitar dots y convertir comma a dot
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(/,/g, ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    // 4,15 -> decimal comma
    s = s.replace(/,/g, ".");
  } else {
    // 12,686 -> podría ser miles => quitar comas
    s = s.replace(/,/g, "");
  }

  const v = Number(s);
  return Number.isFinite(v) ? v : undefined;
}

function n(x: any): number {
  const v = parseNum(x);
  return v ?? 0;
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
  "sel",
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

type ColKey = (typeof COLS)[number];
const COL_LABEL: Record<ColKey, string> = {
  sel: "Sel",
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

// ✅ SOLO Universo (muestra meta)
const COLS_UNI = [...COLS] as const;

type ColKeyUni = (typeof COLS_UNI)[number];

const COL_LABEL_UNI: Record<ColKeyUni, string> = {
  ...(COL_LABEL as any),
};

const COLS_LOWREC = [
  "sel",
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

type ColKeyLow = (typeof COLS_LOWREC)[number];

const COL_LABEL_LOWREC: Record<ColKeyLow, string> = {
  ...(COL_LABEL as any),
  rec_class: "Clasificación",
};

type SelectedMap = Record<string, boolean>;

function filterSelected(rows: LotRow[], selected: SelectedMap) {
  return rows.filter((r) => !!r._k && selected[r._k] !== false); // default TRUE
}

function DataTableUniverse({
  rows,
  selected,
  onToggle,
  onSetMany,
}: {
  rows: LotRow[];
  selected: SelectedMap;
  onToggle: (rowKey: string) => void;
  onSetMany: (rowKeys: string[], value: boolean) => void;
}) {
  type SortDir = "asc" | "desc";
  const [sort, setSort] = useState<{ key: ColKeyUni; dir: SortDir } | null>(null);

  const NUM_COLS = useMemo(
    () =>
      new Set<ColKeyUni>([
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
      ]),
    []
  );

  const keys = useMemo(() => rows.map((r) => r._k).filter(Boolean) as string[], [rows]);

  const toggleSort = (c: ColKeyUni) => {
    if (c === "sel" || c === "nro") return;
    setSort((prev) => {
      if (!prev || prev.key !== c) return { key: c, dir: "asc" };
      return { key: c, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  };

  const sortedRows = useMemo(() => {
    if (!sort) return rows;

    const { key, dir } = sort;
    const factor = dir === "asc" ? 1 : -1;

    const withIdx = rows.map((r, idx) => ({ r, idx }));

    const cmp = (a: LotRow, b: LotRow) => {
      if (NUM_COLS.has(key)) {
        const va = n((a as any)[key]);
        const vb = n((b as any)[key]);
        if (va === vb) return 0;
        return va < vb ? -1 : 1;
      }

      const sa = String(((a as any)[key] ?? "")).toLowerCase();
      const sb = String(((b as any)[key] ?? "")).toLowerCase();
      if (sa === sb) return 0;
      return sa.localeCompare(sb, "es");
    };

    withIdx.sort((A, B) => {
      const main = cmp(A.r, B.r) * factor;
      if (main !== 0) return main;
      return A.idx - B.idx;
    });

    return withIdx.map((x) => x.r);
  }, [rows, sort, NUM_COLS]);

  const selectedRows = useMemo(() => filterSelected(sortedRows, selected), [sortedRows, selected]);

  const selectedCount = selectedRows.length;
  const allCount = rows.length;

  const allSelected = keys.length > 0 && keys.every((k) => selected[k] !== false);
  const noneSelected = keys.length > 0 && keys.every((k) => selected[k] === false);

  const tmsSum = selectedRows.reduce((acc, r) => acc + n(r.tms), 0);
  const tmhSum = selectedRows.reduce((acc, r) => acc + n(r.tmh), 0);

  const wSum = selectedRows.reduce((acc, r) => acc + w(r), 0);
  const wavg = (get: (r: LotRow) => number) =>
    wSum > 0 ? selectedRows.reduce((acc, r) => acc + w(r) * get(r), 0) / wSum : 0;

  const humW = wavg((r) => n(r.humedad_pct));
  const auW = wavg((r) => n(r.au_gr_ton));
  const agW = wavg((r) => n(r.ag_gr_ton));
  const cuW = wavg((r) => n(r.cu_pct));
  const nacnW = wavg((r) => n(r.nacn_kg_t));
  const naohW = wavg((r) => n(r.naoh_kg_t));
  const recW = wavg((r) => n(r.rec_pct));

  const auFinoSum = selectedRows.reduce((acc, r) => acc + n(r.au_fino), 0);
  const agFinoSum = selectedRows.reduce((acc, r) => acc + n(r.ag_fino), 0);

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

  const sortMark = (c: ColKeyUni) => {
    if (!sort || sort.key !== c) return "";
    return sort.dir === "asc" ? " ▲" : " ▼";
  };

  return (
    <div style={wrapStyle}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {COLS_UNI.map((c) => {
              if (c === "sel") {
                return (
                  <th key={c} style={{ ...thStyle, width: 54 }}>
                    <input
                      type="checkbox"
                      checked={allSelected && !noneSelected}
                      ref={(el) => {
                        if (!el) return;
                        el.indeterminate = !allSelected && !noneSelected;
                      }}
                      onChange={(e) => onSetMany(keys, e.target.checked)}
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                      title="Seleccionar/Deseleccionar todos"
                    />
                  </th>
                );
              }

              const sortable = c !== "nro";
              return (
                <th
                  key={c}
                  style={{ ...thStyle, cursor: sortable ? "pointer" : "default", userSelect: "none" }}
                  onClick={() => sortable && toggleSort(c)}
                  title={sortable ? "Ordenar" : ""}
                >
                  {COL_LABEL_UNI[c] ?? c}
                  {sortable ? sortMark(c) : ""}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {sortedRows.map((r, i) => {
            const k = r._k || `${i}`;
            const isSel = selected[k] !== false;

            return (
              <tr key={k} style={{ borderBottom: "1px solid rgba(255,255,255,.08)", opacity: isSel ? 1 : 0.45 }}>
                <td style={tdStyle}>
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => onToggle(k)}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                    title="Incluir en export/sumas"
                  />
                </td>

                <td style={tdStyle}>{i + 1}</td>

                <td style={tdStyle}>{r.codigo ?? ""}</td>
                <td style={tdStyle}>{r.zona ?? ""}</td>
                <td style={tdStyle}>{fmt(r.tmh, 2)}</td>
                <td style={tdStyle}>{fmt(r.humedad_pct, 2)}</td>
                <td style={tdStyle}>{fmt(r.tms, 2)}</td>
                <td style={tdStyle}>{fmt(r.au_gr_ton, 2)}</td>
                <td style={tdStyle}>{fmt(n(r.au_fino), 2)}</td>
                <td style={tdStyle}>{fmt(n(r.ag_gr_ton), 2)}</td>
                <td style={tdStyle}>{fmt(n(r.ag_fino), 2)}</td>
                <td style={tdStyle}>{fmt(r.cu_pct, 2)}</td>
                <td style={tdStyle}>{fmt(r.nacn_kg_t, 2)}</td>
                <td style={tdStyle}>{fmt(r.naoh_kg_t, 2)}</td>
                <td style={tdStyle}>{fmt(r.rec_pct, 2)}</td>

                {/* ✅ meta */}
              </tr>
            );
          })}

          {rows.length === 0 && (
            <tr>
              <td colSpan={COLS_UNI.length} style={{ padding: "10px", color: "rgba(255,255,255,.75)" }}>
                Sin datos.
              </td>
            </tr>
          )}
        </tbody>

        {rows.length > 0 && (
          <tfoot>
            <tr>
              <td style={tfootTd} />
              <td style={tfootTd} />
              <td style={tfootTd}>SUBTOTAL</td>
              <td style={{ ...tfootTd, fontWeight: 600, color: "rgba(255,255,255,.85)" }}>
                ({selectedCount} sel / {allCount})
              </td>

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

              {/* ✅ meta (sin subtotal) */}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}


function DataTable({
  rows,
  selected,
  onToggle,
  onSetMany,

  // ✅ DnD
  dndEnabled,
  viewKey,
  pileCode,
  pileType,
  onMoveRow,
}: {
  rows: LotRow[];
  selected: SelectedMap;
  onToggle: (rowKey: string) => void;
  onSetMany: (rowKeys: string[], value: boolean) => void;

  dndEnabled?: boolean;
  viewKey?: ViewKey;
  pileCode?: number;
  pileType?: PileType;
  onMoveRow?: (args: { view: ViewKey; rowKey: string; toPileCode: number; toPileType: PileType }) => void;
}) {
  type SortDir = "asc" | "desc";
  const [sort, setSort] = useState<{ key: ColKey; dir: SortDir } | null>(null);

  const NUM_COLS = useMemo(
    () =>
      new Set<ColKey>([
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
      ]),
    []
  );

  const keys = useMemo(() => rows.map((r) => r._k).filter(Boolean) as string[], [rows]);

  const toggleSort = (c: ColKey) => {
    if (c === "sel" || c === "nro") return; // nro siempre 1..n (no ordenar por #)
    setSort((prev) => {
      if (!prev || prev.key !== c) return { key: c, dir: "asc" };
      return { key: c, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  };

  const sortedRows = useMemo(() => {
    if (!sort) return rows;

    const { key, dir } = sort;
    const factor = dir === "asc" ? 1 : -1;

    const withIdx = rows.map((r, idx) => ({ r, idx }));

    const cmp = (a: LotRow, b: LotRow) => {
      if (NUM_COLS.has(key)) {
        const va = n((a as any)[key]);
        const vb = n((b as any)[key]);
        if (va === vb) return 0;
        return va < vb ? -1 : 1;
      }

      const sa = String(((a as any)[key] ?? "")).toLowerCase();
      const sb = String(((b as any)[key] ?? "")).toLowerCase();
      if (sa === sb) return 0;
      return sa.localeCompare(sb, "es");
    };

    withIdx.sort((A, B) => {
      const main = cmp(A.r, B.r) * factor;
      if (main !== 0) return main;
      return A.idx - B.idx; // estable
    });

    return withIdx.map((x) => x.r);
  }, [rows, sort, NUM_COLS]);

  const selectedRows = useMemo(() => filterSelected(sortedRows, selected), [sortedRows, selected]);

  const selectedCount = selectedRows.length;
  const allCount = rows.length;

  const allSelected = keys.length > 0 && keys.every((k) => selected[k] !== false);
  const noneSelected = keys.length > 0 && keys.every((k) => selected[k] === false);

  const tmsSum = selectedRows.reduce((acc, r) => acc + n(r.tms), 0);
  const tmhSum = selectedRows.reduce((acc, r) => acc + n(r.tmh), 0);

  const wSum = selectedRows.reduce((acc, r) => acc + w(r), 0);
  const wavg = (get: (r: LotRow) => number) =>
    wSum > 0 ? selectedRows.reduce((acc, r) => acc + w(r) * get(r), 0) / wSum : 0;

  const humW = wavg((r) => n(r.humedad_pct));
  const auW = wavg((r) => n(r.au_gr_ton));
  const agW = wavg((r) => n(r.ag_gr_ton));
  const cuW = wavg((r) => n(r.cu_pct));
  const nacnW = wavg((r) => n(r.nacn_kg_t));
  const naohW = wavg((r) => n(r.naoh_kg_t));
  const recW = wavg((r) => n(r.rec_pct));

  const auFinoSum = selectedRows.reduce((acc, r) => acc + n(r.au_fino), 0);
  const agFinoSum = selectedRows.reduce((acc, r) => acc + n(r.ag_fino), 0);

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

  const sortMark = (c: ColKey) => {
    if (!sort || sort.key !== c) return "";
    return sort.dir === "asc" ? " ▲" : " ▼";
  };

  // ✅ drop handler (mover fila entre pilas)
  const handleDrop = (e: React.DragEvent) => {
    if (!dndEnabled || !onMoveRow || !viewKey || pileCode == null || !pileType) return;
    e.preventDefault();

    const raw = e.dataTransfer.getData("application/json") || e.dataTransfer.getData("text/plain") || "";
    if (!raw) return;

    try {
      const p = JSON.parse(raw) as { view: ViewKey; rowKey: string; fromPileCode: number; fromPileType: PileType };
      if (!p?.rowKey || p.view !== viewKey) return;

      if (p.fromPileCode === pileCode && p.fromPileType === pileType) return;

      onMoveRow({ view: viewKey, rowKey: p.rowKey, toPileCode: pileCode, toPileType: pileType });
    } catch {}
  };

  return (
    <div
      style={wrapStyle}
      onDragOver={(e) => {
        if (!dndEnabled) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={handleDrop}
      title={dndEnabled ? "Arrastra un lote y suéltalo aquí para moverlo a esta pila" : undefined}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {COLS.map((c) => {
              if (c === "sel") {
                return (
                  <th key={c} style={{ ...thStyle, width: 54 }}>
                    <input
                      type="checkbox"
                      checked={allSelected && !noneSelected}
                      ref={(el) => {
                        if (!el) return;
                        el.indeterminate = !allSelected && !noneSelected;
                      }}
                      onChange={(e) => onSetMany(keys, e.target.checked)}
                      title="Seleccionar/Deseleccionar todos"
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                  </th>
                );
              }

              const sortable = c !== "nro";
              return (
                <th
                  key={c}
                  style={{
                    ...thStyle,
                    cursor: sortable ? "pointer" : "default",
                    userSelect: "none",
                  }}
                  onClick={() => sortable && toggleSort(c)}
                  title={sortable ? "Ordenar" : ""}
                >
                  {COL_LABEL[c] ?? c}
                  {sortable ? sortMark(c) : ""}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {sortedRows.map((r, i) => {
            const k = r._k || `${i}`;
            const isSel = selected[k] !== false; // default true

            return (
              <tr
                key={k}
                draggable={!!dndEnabled}
                onDragStart={(e) => {
                  if (!dndEnabled || !viewKey || pileCode == null || !pileType) return;
                  const payload = { view: viewKey, rowKey: k, fromPileCode: pileCode, fromPileType: pileType };
                  const s = JSON.stringify(payload);
                  e.dataTransfer.setData("application/json", s);
                  e.dataTransfer.setData("text/plain", s);
                  e.dataTransfer.effectAllowed = "move";
                }}
                style={{
                  borderBottom: "1px solid rgba(255,255,255,.08)",
                  opacity: isSel ? 1 : 0.45,
                  cursor: dndEnabled ? "grab" : "default",
                }}
                title={dndEnabled ? "Arrastra este lote a otra pila" : undefined}
              >
                <td style={tdStyle}>
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => onToggle(k)}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                    title="Incluir en export/sumas"
                  />
                </td>

                {/* ✅ # siempre 1..n según el orden actual */}
                <td style={tdStyle}>{i + 1}</td>

                <td style={tdStyle}>{r.codigo ?? ""}</td>
                <td style={tdStyle}>{r.zona ?? ""}</td>
                <td style={tdStyle}>{fmt(r.tmh, 2)}</td>
                <td style={tdStyle}>{fmt(r.humedad_pct, 2)}</td>
                <td style={tdStyle}>{fmt(r.tms, 2)}</td>
                <td style={tdStyle}>{fmt(r.au_gr_ton, 2)}</td>
                <td style={tdStyle}>{fmt(n(r.au_fino), 2)}</td>
                <td style={tdStyle}>{fmt(n(r.ag_gr_ton), 2)}</td>
                <td style={tdStyle}>{fmt(n(r.ag_fino), 2)}</td>
                <td style={tdStyle}>{fmt(r.cu_pct, 2)}</td>
                <td style={tdStyle}>{fmt(r.nacn_kg_t, 2)}</td>
                <td style={tdStyle}>{fmt(r.naoh_kg_t, 2)}</td>
                <td style={tdStyle}>{fmt(r.rec_pct, 2)}</td>
              </tr>
            );
          })}

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
              <td style={tfootTd} />
              <td style={tfootTd}>SUBTOTAL</td>
              <td style={{ ...tfootTd, fontWeight: 600, color: "rgba(255,255,255,.85)" }}>
                ({selectedCount} sel / {allCount})
              </td>

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

function DataTableLowRec({
  rows,
  selected,
  onToggle,
  onSetMany,
}: {
  rows: LotRow[];
  selected: SelectedMap;
  onToggle: (rowKey: string) => void;
  onSetMany: (rowKeys: string[], value: boolean) => void;
}) {
  type SortDir = "asc" | "desc";
  const [sort, setSort] = useState<{ key: ColKeyLow; dir: SortDir } | null>(null);

  const NUM_COLS = useMemo(
    () =>
      new Set<ColKeyLow>([
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
      ]),
    []
  );

  const keys = useMemo(() => rows.map((r) => r._k).filter(Boolean) as string[], [rows]);

  const toggleSort = (c: ColKeyLow) => {
    if (c === "sel" || c === "nro") return; // nro siempre 1..n
    setSort((prev) => {
      if (!prev || prev.key !== c) return { key: c, dir: "asc" };
      return { key: c, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  };

  const sortedRows = useMemo(() => {
    if (!sort) return rows;

    const { key, dir } = sort;
    const factor = dir === "asc" ? 1 : -1;

    const withIdx = rows.map((r, idx) => ({ r, idx }));

    const cmp = (a: LotRow, b: LotRow) => {
      if (NUM_COLS.has(key)) {
        const va = n((a as any)[key]);
        const vb = n((b as any)[key]);
        if (va === vb) return 0;
        return va < vb ? -1 : 1;
      }

      const sa = String(((a as any)[key] ?? "")).toLowerCase();
      const sb = String(((b as any)[key] ?? "")).toLowerCase();
      if (sa === sb) return 0;
      return sa.localeCompare(sb, "es");
    };

    withIdx.sort((A, B) => {
      const main = cmp(A.r, B.r) * factor;
      if (main !== 0) return main;
      return A.idx - B.idx;
    });

    return withIdx.map((x) => x.r);
  }, [rows, sort, NUM_COLS]);

  const selectedRows = useMemo(() => filterSelected(sortedRows, selected), [sortedRows, selected]);

  const selectedCount = selectedRows.length;
  const allCount = rows.length;

  const allSelected = keys.length > 0 && keys.every((k) => selected[k] !== false);
  const noneSelected = keys.length > 0 && keys.every((k) => selected[k] === false);

  const tmsSum = selectedRows.reduce((acc, r) => acc + n(r.tms), 0);
  const tmhSum = selectedRows.reduce((acc, r) => acc + n(r.tmh), 0);

  const wSum = selectedRows.reduce((acc, r) => acc + w(r), 0);
  const wavg = (get: (r: LotRow) => number) =>
    wSum > 0 ? selectedRows.reduce((acc, r) => acc + w(r) * get(r), 0) / wSum : 0;

  const humW = wavg((r) => n(r.humedad_pct));
  const auW = wavg((r) => n(r.au_gr_ton));
  const agW = wavg((r) => n(r.ag_gr_ton));
  const cuW = wavg((r) => n(r.cu_pct));
  const nacnW = wavg((r) => n(r.nacn_kg_t));
  const naohW = wavg((r) => n(r.naoh_kg_t));
  const recW = wavg((r) => n(r.rec_pct));

  const auFinoSum = selectedRows.reduce((acc, r) => acc + n(r.au_fino), 0);
  const agFinoSum = selectedRows.reduce((acc, r) => acc + n(r.ag_fino), 0);

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

  const sortMark = (c: ColKeyLow) => {
    if (!sort || sort.key !== c) return "";
    return sort.dir === "asc" ? " ▲" : " ▼";
  };

  return (
    <div style={wrapStyle}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {COLS_LOWREC.map((c) => {
              if (c === "sel") {
                return (
                  <th key={c} style={{ ...thStyle, width: 54 }}>
                    <input
                      type="checkbox"
                      checked={allSelected && !noneSelected}
                      ref={(el) => {
                        if (!el) return;
                        el.indeterminate = !allSelected && !noneSelected;
                      }}
                      onChange={(e) => onSetMany(keys, e.target.checked)}
                      title="Seleccionar/Deseleccionar todos"
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                  </th>
                );
              }

              const sortable = c !== "nro";
              return (
                <th
                  key={c}
                  style={{
                    ...thStyle,
                    cursor: sortable ? "pointer" : "default",
                    userSelect: "none",
                  }}
                  onClick={() => sortable && toggleSort(c)}
                  title={sortable ? "Ordenar" : ""}
                >
                  {COL_LABEL_LOWREC[c] ?? c}
                  {sortable ? sortMark(c) : ""}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {sortedRows.map((r, i) => {
            const k = r._k || `${i}`;
            const isSel = selected[k] !== false;
            return (
              <tr
                key={k}
                style={{
                  borderBottom: "1px solid rgba(255,255,255,.08)",
                  opacity: isSel ? 1 : 0.45,
                }}
              >
                <td style={tdStyle}>
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => onToggle(k)}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                    title="Incluir en export/sumas"
                  />
                </td>

                {/* ✅ # siempre 1..n según el orden actual */}
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
            );
          })}

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
              <td style={tfootTd} />
              <td style={tfootTd}>SUBTOTAL</td>
              <td style={{ ...tfootTd, fontWeight: 600, color: "rgba(255,255,255,.85)" }}>
                ({selectedCount} sel / {allCount})
              </td>

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

      <span style={{ fontSize: 12, color: "rgba(255,255,255,.70)" }}>
        Default: todas seleccionadas. Si quitas una, filtra.
      </span>
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

function buildSelectedMapAllTrue(rows: LotRow[]) {
  const m: SelectedMap = {};
  for (const r of rows) {
    if (r._k) m[r._k] = true;
  }
  return m;
}

function addKeysToRows(view: ViewKey, rows: LotRow[]) {
  return (rows ?? []).map((r, idx) => {
    const idPart = r.id != null ? `id:${r.id}` : `i:${idx}`;
    const pilePart = `${r.pile_code ?? 0}_${(r.pile_type ?? "varios") as string}`;
    const codePart = `${r.codigo ?? ""}`;
    const zonePart = `${r.zona ?? ""}`;
    const dtPart = `${r.loaded_at ?? r.created_at ?? ""}`;
    const key = `${view}|${pilePart}|${codePart}|${zonePart}|${dtPart}|${idPart}`;
    return { ...r, _k: key };
  });
}

function UniverseTable({
  rows,
  loading,
}: {
  rows: LotRow[];
  loading: boolean;
}) {
  const zones = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.zona) s.add(String(r.zona));
    return Array.from(s).sort((a, b) => a.localeCompare(b, "es"));
  }, [rows]);

  const [zonesSel, setZonesSel] = useState<string[]>([]);
  useEffect(() => {
  setZonesSel((prev) => {
    if (!zones || zones.length === 0) return [];

    // 1) primera carga: todas
    if (!prev || prev.length === 0) return zones;

    // 2) si cambió el universo: mantener intersección; si queda vacío, volver a todas
    const setZ = new Set(zones);
    const kept = prev.filter((z) => setZ.has(z));
    return kept.length > 0 ? kept : zones;
  });
}, [zones]);

// ✅ selección para universo (default todo true)
const [selUni, setSelUni] = useState<SelectedMap>({});

function toggleUni(rowKey: string) {
  setSelUni((prev) => {
    const nextVal = prev[rowKey] === false ? true : false; // default true -> false
    return { ...prev, [rowKey]: nextVal };
  });
}

function setManyUni(rowKeys: string[], value: boolean) {
  setSelUni((prev) => {
    const cur = { ...prev };
    for (const k of rowKeys) cur[k] = value;
    return cur;
  });
}

// ✅ cuando cambian filas (uniRows), inicializa selección en true sin reventar lo ya tocado
useEffect(() => {
  setSelUni((prev) => {
    const next = { ...prev };
    for (const r of rows ?? []) {
      if (r._k && next[r._k] === undefined) next[r._k] = true;
    }
    return next;
  });
}, [rows]);
  

const [tmhMin, setTmhMin] = useState("");
  const [tmhMax, setTmhMax] = useState("");
  const [auMin, setAuMin] = useState("");
  const [auMax, setAuMax] = useState("");
  const [cuMin, setCuMin] = useState("");
  const [cuMax, setCuMax] = useState("");
  const [recMin, setRecMin] = useState("");
  const [recMax, setRecMax] = useState("");
  const [naohMin, setNaohMin] = useState("");
  const [naohMax, setNaohMax] = useState("");
  const [nacnMin, setNacnMin] = useState("");
  const [nacnMax, setNacnMax] = useState("");

  // ✅ helpers: string para input (sin comas)
const sFixed = (v?: number, d = 2) => (v == null ? "" : Number(v).toFixed(d));

// ✅ min/max reales por campo (ignora null/""/NaN)
const ranges = useMemo(() => {
  const toNumOpt = (x: any): number | undefined => parseNum(x);

  const mm = (get: (r: LotRow) => any) => {
    let min = Infinity;
    let max = -Infinity;

    for (const r of rows ?? []) {
      const v = toNumOpt(get(r));
      if (v == null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }

    if (min === Infinity || max === -Infinity) {
      return { min: undefined, max: undefined, minInput: "", maxInput: "", minHint: "", maxHint: "" };
    }

    return {
      min,
      max,
      minInput: sFixed(min, 2),
      maxInput: sFixed(max, 2),
      minHint: fmt(min, 2), // ✅ hint con comas
      maxHint: fmt(max, 2),
    };
  };

  return {
    tmh: mm((r) => r.tmh),
    au: mm((r) => r.au_gr_ton),
    cu: mm((r) => r.cu_pct),
    rec: mm((r) => r.rec_pct),
    naoh: mm((r) => r.naoh_kg_t),
    nacn: mm((r) => r.nacn_kg_t),
  };
}, [rows]);

// ✅ init: si todo está vacío, setea defaults min/max reales

  const num = (s: string): number | undefined => parseNum(s);

  const inRange = (x: any, min?: number, max?: number) => {
  const v = parseNum(x);
  // si el usuario no puso min/max, no filtra aunque v sea undefined
  if (min == null && max == null) return true;

  // si sí puso min/max pero el dato no existe, se excluye
  if (v == null) return false;

  if (min != null && v < min) return false;
  if (max != null && v > max) return false;
  return true;
};


  const filtered = useMemo(() => {
    const zSet = new Set(zonesSel);
    const _tmhMin = num(tmhMin), _tmhMax = num(tmhMax);
    const _auMin = num(auMin), _auMax = num(auMax);
    const _cuMin = num(cuMin), _cuMax = num(cuMax);
    const _recMin = num(recMin), _recMax = num(recMax);
    const _naohMin = num(naohMin), _naohMax = num(naohMax);
    const _nacnMin = num(nacnMin), _nacnMax = num(nacnMax);

    return (rows ?? []).filter((r) => {
      const useZoneFilter = zonesSel.length > 0 && zonesSel.length < zones.length;
      if (useZoneFilter && r.zona && !zSet.has(String(r.zona))) return false;


      if (!inRange(r.tmh, _tmhMin, _tmhMax)) return false;
      if (!inRange(r.au_gr_ton, _auMin, _auMax)) return false;
      if (!inRange(r.cu_pct, _cuMin, _cuMax)) return false;
      if (!inRange(r.rec_pct, _recMin, _recMax)) return false;
      if (!inRange(r.naoh_kg_t, _naohMin, _naohMax)) return false;
      if (!inRange(r.nacn_kg_t, _nacnMin, _nacnMax)) return false;

      return true;
    });
  }, [rows, zonesSel, tmhMin, tmhMax, auMin, auMax, cuMin, cuMax, recMin, recMax, naohMin, naohMax, nacnMin, nacnMax]);

  const mini: React.CSSProperties = {
    padding: "10px 10px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,.25)",
    background: "rgba(0,0,0,.12)",
    color: "white",
    outline: "none",
    fontSize: 13,
    width: 110,
  };

  const reset = () => {
  setZonesSel(zones); // default: todas

  // filtros vacíos => NO filtra
  setTmhMin(""); setTmhMax("");
  setAuMin("");  setAuMax("");
  setCuMin("");  setCuMax("");
  setRecMin(""); setRecMax("");
  setNaohMin(""); setNaohMax("");
  setNacnMin(""); setNacnMax("");
};



  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 10px",
    borderBottom: "1px solid rgba(255,255,255,.2)",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 2,
    background: "rgba(0,0,0,.28)",
    backdropFilter: "blur(6px)",
  };
  const td: React.CSSProperties = { padding: "8px 10px", whiteSpace: "nowrap" };

  return (
    <div style={{ background: "rgba(0,0,0,.10)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
        <ZoneDropdown
          zones={zones}
          selected={zonesSel}
          onToggle={(z) =>
            setZonesSel((prev) => {
              const has = prev.includes(z);
              if (has) return prev.length <= 1 ? prev : prev.filter((x) => x !== z);
              return [...prev, z];
            })
          }
          onSelectAll={() => setZonesSel(zones)}
        />

        {/** TMH */}
        <div>
          <b style={{ fontSize: 13 }}>TMH</b>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={mini} placeholder={ranges.tmh.minHint || "min"} value={tmhMin} onChange={(e) => setTmhMin(e.target.value)} />
            <input style={mini} placeholder={ranges.tmh.maxHint || "max"} value={tmhMax} onChange={(e) => setTmhMax(e.target.value)} />
          </div>
        </div>

        {/** Au */}
        <div>
          <b style={{ fontSize: 13 }}>Au (g/t)</b>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={mini} placeholder={ranges.au.minHint || "min"} value={auMin} onChange={(e) => setAuMin(e.target.value)} />
            <input style={mini} placeholder={ranges.au.maxHint || "max"} value={auMax} onChange={(e) => setAuMax(e.target.value)} />
          </div>
        </div>

        {/** Cu */}
        <div>
          <b style={{ fontSize: 13 }}>Cu (%)</b>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={mini} placeholder={ranges.cu.minHint || "min"} value={cuMin} onChange={(e) => setCuMin(e.target.value)} />
            <input style={mini} placeholder={ranges.cu.maxHint || "max"} value={cuMax} onChange={(e) => setCuMax(e.target.value)} />
          </div>
        </div>

        {/** Rec */}
        <div>
          <b style={{ fontSize: 13 }}>Rec (%)</b>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={mini} placeholder={ranges.rec.minHint || "min"} value={recMin} onChange={(e) => setRecMin(e.target.value)} />
            <input style={mini} placeholder={ranges.rec.maxHint || "max"} value={recMax} onChange={(e) => setRecMax(e.target.value)} />
          </div>
        </div>

        {/** NaOH */}
        <div>
          <b style={{ fontSize: 13 }}>NaOH (kg/t)</b>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={mini} placeholder={ranges.naoh.minHint || "min"} value={naohMin} onChange={(e) => setNaohMin(e.target.value)} />
            <input style={mini} placeholder={ranges.naoh.maxHint || "max"} value={naohMax} onChange={(e) => setNaohMax(e.target.value)} />
          </div>
        </div>

        {/** NaCN */}
        <div>
          <b style={{ fontSize: 13 }}>NaCN (kg/t)</b>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={mini} placeholder={ranges.nacn.minHint || "min"} value={nacnMin} onChange={(e) => setNacnMin(e.target.value)} />
            <input style={mini} placeholder={ranges.nacn.maxHint || "max"} value={nacnMax} onChange={(e) => setNacnMax(e.target.value)} />
          </div>
        </div>

        <button
          type="button"
          onClick={reset}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,.25)",
            background: "rgba(255,255,255,.10)",
            color: "white",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Limpiar
        </button>

        <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)" }}>
          Mostrando <b>{filtered.length}</b> / {rows.length}
        </div>
      </div>

      <DataTableUniverse
  rows={filtered}
  selected={selUni}
  onToggle={toggleUni}
  onSetMany={setManyUni}
/>


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
  const [r4, setR4] = useState<LotRow[]>([]);
  const [u1, setU1] = useState<LotRow[]>([]);
  const [u2, setU2] = useState<LotRow[]>([]);
  const [u3, setU3] = useState<LotRow[]>([]);
  // ===== UNIVERSO LOTES (reemplaza Power BI) =====
  const [uniRows, setUniRows] = useState<LotRow[]>([]);
  const [uniLoading, setUniLoading] = useState(false);
  const [uniErr, setUniErr] = useState("");



  // ✅ selection per view (default all true, can deselect)
  const [sel, setSel] = useState<Record<ViewKey, SelectedMap>>({
    "1": {},
    "2": {},
    "3": {},
    "4": {},
  });

  // ✅ selección para "No usados" (default todo true)
const [selU, setSelU] = useState<Record<ViewKey, SelectedMap>>({
  "1": {},
  "2": {},
  "3": {},
  "4": {},
});

// ✅ slots de pilas para que no desaparezcan al quedar vacías
const [pileSlots, setPileSlots] = useState<
  Record<ViewKey, Array<{ pile_code: number; pile_type: PileType }>>
>({
  "1": [],
  "2": [],
  "3": [],
  "4": [],
});

  
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

  // ✅ export state
  const [exportPdfLoading, setExportPdfLoading] = useState(false);
  const [exportExcelLoading, setExportExcelLoading] = useState(false);

  const [etlLoading, setEtlLoading] = useState(false);

  const busyCalc = calcLoading;

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

  function toggleRowSelection(viewKey: ViewKey, rowKey: string) {
    setSel((prev) => {
      const cur = prev[viewKey] ?? {};
      const nextVal = cur[rowKey] === false ? true : false; // default true -> false
      return { ...prev, [viewKey]: { ...cur, [rowKey]: nextVal } };
    });
  }

  function setManySelection(viewKey: ViewKey, rowKeys: string[], value: boolean) {
    setSel((prev) => {
      const cur = { ...(prev[viewKey] ?? {}) };
      for (const k of rowKeys) cur[k] = value;
      return { ...prev, [viewKey]: cur };
    });
  }

  function toggleRowSelectionUnused(viewKey: ViewKey, rowKey: string) {
  setSelU((prev) => {
    const cur = prev[viewKey] ?? {};
    const nextVal = cur[rowKey] === false ? true : false; // default true -> false
    return { ...prev, [viewKey]: { ...cur, [rowKey]: nextVal } };
  });
}

function setManySelectionUnused(viewKey: ViewKey, rowKeys: string[], value: boolean) {
  setSelU((prev) => {
    const cur = { ...(prev[viewKey] ?? {}) };
    for (const k of rowKeys) cur[k] = value;
    return { ...prev, [viewKey]: cur };
  });
}


  // ✅ mover lote entre pilas (solo view 2/3)
  function moveRowBetweenPiles(args: { view: ViewKey; rowKey: string; toPileCode: number; toPileType: PileType }) {
  const { view, rowKey, toPileCode, toPileType } = args;

    if (view === "1") {
    // ✅ DESTINO: NO USADOS (pileCode=0)
    if (toPileCode === 0) {
      setR1((prevR) => {
        const row = prevR.find((r) => r._k === rowKey);
        if (!row) return prevR;

        const nextR = prevR.filter((r) => r._k !== rowKey);

        // meter a no usados
        setU1((prevU) => [...prevU, { ...row, pile_code: 0, pile_type: "varios" }]);

        // selección: quitar de sel de pilas y agregar a selU
        setSel((s) => {
          const m = { ...(s["1"] ?? {}) };
          delete m[rowKey];
          return { ...s, "1": m };
        });
        setSelU((su) => ({ ...su, "1": { ...(su["1"] ?? {}), [rowKey]: true } }));

        return nextR;
      });

      return;
    }

    // 1) si estaba en r1 -> mover dentro de r1
    setR1((prev) => {
      const exists = prev.some((r) => r._k === rowKey);
      if (!exists) return prev;
      return prev.map((r) => (r._k === rowKey ? { ...r, pile_code: toPileCode, pile_type: toPileType } : r));
    });

    // 2) si estaba en u1 -> sacarlo de u1 y meterlo a r1
    setU1((prevU) => {
      const idx = prevU.findIndex((r) => r._k === rowKey);
      if (idx === -1) return prevU;

      const row = prevU[idx];
      const nextU = prevU.filter((r) => r._k !== rowKey);

      setR1((prevR) => [...prevR, { ...row, pile_code: toPileCode, pile_type: toPileType }]);

      setSel((s) => ({ ...s, "1": { ...(s["1"] ?? {}), [rowKey]: true } }));
      setSelU((su) => {
        const m = { ...(su["1"] ?? {}) };
        delete m[rowKey];
        return { ...su, "1": m };
      });

      return nextU;
    });

    return;
  }

  
  if (view === "2") {
    // ✅ DESTINO: NO USADOS (pileCode=0)
if (toPileCode === 0) {
  setR2((prevR) => {
    const row = prevR.find((r) => r._k === rowKey);
    if (!row) return prevR;

    // sacar de pilas
    const nextR = prevR.filter((r) => r._k !== rowKey);

    // meter a no usados
    setU2((prevU) => [...prevU, { ...row, pile_code: 0, pile_type: "varios" }]);

    // selección: quitar de sel de pilas y agregar a selU
    setSel((s) => {
      const m = { ...(s["2"] ?? {}) };
      delete m[rowKey];
      return { ...s, "2": m };
    });
    setSelU((su) => ({ ...su, "2": { ...(su["2"] ?? {}), [rowKey]: true } }));

    return nextR;
  });

  return;
}

    // 1) si estaba en r2 -> mover dentro de r2
    setR2((prev) => {
      const exists = prev.some((r) => r._k === rowKey);
      if (!exists) return prev;
      return prev.map((r) => (r._k === rowKey ? { ...r, pile_code: toPileCode, pile_type: toPileType } : r));
    });

    // 2) si estaba en u2 -> sacarlo de u2 y meterlo a r2
    setU2((prevU) => {
      const idx = prevU.findIndex((r) => r._k === rowKey);
      if (idx === -1) return prevU;

      const row = prevU[idx];
      const nextU = prevU.filter((r) => r._k !== rowKey);

      setR2((prevR) => [...prevR, { ...row, pile_code: toPileCode, pile_type: toPileType }]);

      // selección: en pilas lo dejamos seleccionado; en no usados ya no aplica
      setSel((s) => ({ ...s, "2": { ...(s["2"] ?? {}), [rowKey]: true } }));
      setSelU((su) => {
        const m = { ...(su["2"] ?? {}) };
        delete m[rowKey];
        return { ...su, "2": m };
      });

      return nextU;
    });

    return;
  }

  if (view === "3") {
    // ✅ DESTINO: NO USADOS (pileCode=0)
if (toPileCode === 0) {
  setR3((prevR) => {
    const row = prevR.find((r) => r._k === rowKey);
    if (!row) return prevR;

    const nextR = prevR.filter((r) => r._k !== rowKey);

    setU3((prevU) => [...prevU, { ...row, pile_code: 0, pile_type: "varios" }]);

    setSel((s) => {
      const m = { ...(s["3"] ?? {}) };
      delete m[rowKey];
      return { ...s, "3": m };
    });
    setSelU((su) => ({ ...su, "3": { ...(su["3"] ?? {}), [rowKey]: true } }));

    return nextR;
  });

  return;
}

    // 1) si estaba en r3 -> mover dentro de r3
    setR3((prev) => {
      const exists = prev.some((r) => r._k === rowKey);
      if (!exists) return prev;
      return prev.map((r) => (r._k === rowKey ? { ...r, pile_code: toPileCode, pile_type: toPileType } : r));
    });

    // 2) si estaba en u3 -> sacarlo de u3 y meterlo a r3
    setU3((prevU) => {
      const idx = prevU.findIndex((r) => r._k === rowKey);
      if (idx === -1) return prevU;

      const row = prevU[idx];
      const nextU = prevU.filter((r) => r._k !== rowKey);

      setR3((prevR) => [...prevR, { ...row, pile_code: toPileCode, pile_type: toPileType }]);

      setSel((s) => ({ ...s, "3": { ...(s["3"] ?? {}), [rowKey]: true } }));
      setSelU((su) => {
        const m = { ...(su["3"] ?? {}) };
        delete m[rowKey];
        return { ...su, "3": m };
      });

      return nextU;
    });

    return;
  }
}


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
      const [a, b, c, uA, uB, uC, uUni] = await Promise.all([
  fetch("/api/pilas?which=1", { cache: "no-store" }),
  fetch("/api/pilas?which=2", { cache: "no-store" }),
  fetch("/api/pilas?which=3", { cache: "no-store" }),

  fetch("/api/unused?which=1", { cache: "no-store" }),
  fetch("/api/unused?which=2", { cache: "no-store" }),
  fetch("/api/unused?which=3", { cache: "no-store" }),

  fetch("/api/lotes", { cache: "no-store" }), // ✅ universo
]);



      const ja = await a.json().catch(() => ({}));
      const jb = await b.json().catch(() => ({}));
      const jc = await c.json().catch(() => ({}));

      const juA = await uA.json().catch(() => ({}));
      const juB = await uB.json().catch(() => ({}));
      const juC = await uC.json().catch(() => ({}));
      const jUni = await uUni.json().catch(() => ({}));

      if (!a.ok) throw new Error(ja?.error || "Error cargando resultado 1");
      if (!b.ok) throw new Error(jb?.error || "Error cargando resultado 2");
      if (!c.ok) throw new Error(jc?.error || "Error cargando resultado 3");

      setUniLoading(true);
setUniErr("");
try {
  if (!uUni.ok) throw new Error(jUni?.error || "Error cargando universo");
  const uni = addKeysToRows("1", Array.isArray(jUni?.rows) ? jUni.rows : []);
  setUniRows(uni);
} catch (e: any) {
  setUniRows([]);
  setUniErr(e?.message || "Error");
} finally {
  setUniLoading(false);
}


      const rows1 = addKeysToRows("1", Array.isArray(ja?.rows) ? ja.rows : []);
      const rows2 = addKeysToRows("2", Array.isArray(jb?.rows) ? jb.rows : []);
      const rows3 = addKeysToRows("3", Array.isArray(jc?.rows) ? jc.rows : []);
      const slots1 = groupByPile(rows1).map((p) => ({ pile_code: p.pile_code, pile_type: p.pile_type }));
const slots2 = groupByPile(rows2).map((p) => ({ pile_code: p.pile_code, pile_type: p.pile_type }));
const slots3 = groupByPile(rows3).map((p) => ({ pile_code: p.pile_code, pile_type: p.pile_type }));

const uniqSlots = (arr: Array<{ pile_code: number; pile_type: PileType }>) => {
  const m = new Map<string, { pile_code: number; pile_type: PileType }>();
  for (const x of arr) m.set(`${x.pile_code}__${x.pile_type}`, x);
  return Array.from(m.values()).sort((a, b) => a.pile_code - b.pile_code || a.pile_type.localeCompare(b.pile_type));
};

setPileSlots((prev) => ({
  ...prev,
  "1": uniqSlots([...(prev["1"] ?? []), ...slots1]),
  "2": uniqSlots([...(prev["2"] ?? []), ...slots2]),
  "3": uniqSlots([...(prev["3"] ?? []), ...slots3]),
}));


      setR1(rows1);
      setR2(rows2);
      setR3(rows3);

      const unused1 = addKeysToRows("1", Array.isArray(juA?.rows) ? juA.rows : []);
      const unused2 = addKeysToRows("2", Array.isArray(juB?.rows) ? juB.rows : []);
      const unused3 = addKeysToRows("3", Array.isArray(juC?.rows) ? juC.rows : []);

      setU1(unused1);
      setU2(unused2);
      setU3(unused3);

      // ✅ reset selección "No usados" a todo true cuando recargas
setSelU((prev) => ({
  ...prev,
  "1": buildSelectedMapAllTrue(unused1),
  "2": buildSelectedMapAllTrue(unused2),
  "3": buildSelectedMapAllTrue(unused3),
}));



      // ✅ reset selección a "todo seleccionado" cuando recargas
      setSel((prev) => ({
        ...prev,
        "1": buildSelectedMapAllTrue(rows1),
        "2": buildSelectedMapAllTrue(rows2),
        "3": buildSelectedMapAllTrue(rows3),
      }));

      // Resultado 4 (NO crítico)
      try {
        const d = await fetch("/api/pilas?which=4", { cache: "no-store" });
        const jd = await d.json().catch(() => ({}));
        if (!d.ok) {
          setR4([]);
          setSel((prev) => ({ ...prev, "4": {} }));
        } else {
          const rows4 = addKeysToRows("4", Array.isArray(jd?.rows) ? jd.rows : []);
          setR4(rows4);
          setSel((prev) => ({ ...prev, "4": buildSelectedMapAllTrue(rows4) }));
        }
      } catch {
        setR4([]);
        setSel((prev) => ({ ...prev, "4": {} }));
      }
    } catch (e: any) {
      setLoadError(e?.message || "Error");
      setR1([]);
      setR2([]);
      setR3([]);
      setR4([]);
      setU1([]);
      setU2([]);
      setU3([]);

      setSel({ "1": {}, "2": {}, "3": {}, "4": {} });
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

    // ✅ AUTO-SCROLL mientras haces drag & drop (scroll de la página)
  const dndScrollRaf = useRef<number | null>(null);

  useEffect(() => {
    const EDGE = 90;      // px desde borde para activar scroll
    const MAX_SPEED = 28; // px por frame aprox

    function stopRaf() {
      if (dndScrollRaf.current != null) {
        cancelAnimationFrame(dndScrollRaf.current);
        dndScrollRaf.current = null;
      }
    }

    function onDragOver(e: DragEvent) {
      // Solo cuando el drag viene de tu app (tú seteas application/json en onDragStart)
      const types = Array.from(e.dataTransfer?.types ?? []);
      if (!types.includes("application/json")) return;

      const y = e.clientY;
      const h = window.innerHeight;

      let delta = 0;

      if (y < EDGE) {
        // más cerca al borde => más rápido
        const t = (EDGE - y) / EDGE; // 0..1
        delta = -Math.ceil(6 + t * (MAX_SPEED - 6));
      } else if (y > h - EDGE) {
        const t = (y - (h - EDGE)) / EDGE;
        delta = Math.ceil(6 + t * (MAX_SPEED - 6));
      } else {
        stopRaf();
        return;
      }

      // throttle con RAF para que no sea brusco
      if (dndScrollRaf.current == null) {
        dndScrollRaf.current = requestAnimationFrame(() => {
          window.scrollBy(0, delta);
          dndScrollRaf.current = null;
        });
      }
    }

    function onDragEnd() {
      stopRaf();
    }

    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragend", onDragEnd);
    document.addEventListener("drop", onDragEnd);

    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragend", onDragEnd);
      document.removeEventListener("drop", onDragEnd);
      stopRaf();
    };
  }, []);


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

  // ✅ Baja recuperación agrupada por clasificación (para web)
  const lowRecGroups = useMemo(() => {
    return groupLowRecByClass(r4).filter((g) => g.rows.length > 0);
  }, [r4]);

  const current = view === "1" ? g1 : view === "2" ? g2 : view === "3" ? g3 : [];
  const flatCurrentRows = view === "1" ? r1 : view === "2" ? r2 : view === "3" ? r3 : r4;
  const flatUnusedRows = view === "1" ? u1 : view === "2" ? u2 : view === "3" ? u3 : [];
  const flatSelectedRows = useMemo(() => filterSelected(flatCurrentRows, sel[view] ?? {}), [flatCurrentRows, sel, view]);

  const viewTitle =
    view === "1"
      ? "Resultado 1 – 1 pila Varios"
      : view === "2"
      ? "Resultado 2 – Pilas Batch"
      : view === "3"
      ? "Resultado 3 – Mixto (Varios + Batch)"
      : "Resultado 4 – Baja Recuperación";

  const tabBtn = (k: ViewKey, label: string) => {
    const active = view === k;
    return (
      <button
        key={k}
        onClick={() => setView(k)}
        disabled={busyCalc}
        style={{
          padding: "8px 12px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,.25)",
          background: active ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.10)",
          color: "white",
          fontWeight: 700,
          cursor: busyCalc ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
          opacity: busyCalc ? 0.75 : 1,
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

    const head = [COLS_LOWREC.filter((c) => c !== "sel").map((c) => COL_LABEL_LOWREC[c as ColKeyLow] ?? c)];

    const body = rows.map((r, i) => [
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
          `(${rows.length} sel)`,
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

  // ✅ EXPORT PDF (solo seleccionados)
  async function exportCurrentToPDF() {
    setExportPdfLoading(true);
    try {
      const selectedNow = filterSelected(flatCurrentRows, sel[view] ?? {});
      if (!selectedNow || selectedNow.length === 0) {
        alert("No hay lotes seleccionados para exportar.");
        return;
      }

      const pileDate = getPileDateFromRows(selectedNow);
      const dateStr = formatDDMMYYYY(pileDate);

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

      // ====== Caso: Resultado 4 (TOTAL + por rec_class) SOLO seleccionados ======
      if (view === "4") {
        const sel4 = selectedNow;

        addLowRecTable({
          doc,
          drawHeader,
          title: "Baja Recuperación (Seleccionados)",
          rows: sel4,
          pageW,
          pageH,
          marginX,
          headerH,
          addPageBefore: false,
        });

        const groups = groupLowRecByClass(sel4).filter((g) => g.rows.length > 0);

        for (const g of groups) {
          addLowRecTable({
            doc,
            drawHeader,
            title: `Baja Recuperación – ${g.rec_class} (Sel)`,
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

      // ====== Caso: Resultados 1/2/3 (por pila) SOLO seleccionados ======
      const piles = current;
      if (!piles || piles.length === 0) {
        alert("Sin datos para exportar.");
        return;
      }

      const head = [COLS.filter((c) => c !== "sel").map((c) => COL_LABEL[c as ColKey] ?? c)];

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

      let printedAny = false;

      piles.forEach((p) => {
        const lotesSel = filterSelected(p.lotes, sel[view] ?? {});
        if (lotesSel.length === 0) return;

        if (printedAny) doc.addPage();
        printedAny = true;

        drawHeader();

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(`Pila #${p.pile_code} (${p.pile_type})`, marginX, headerH + 22);

        const k = pileKPIs(lotesSel);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(
          `TMS=${fmt(k.tmsSum, 1)} | Au=${fmt(k.auWeighted, 2)} g/t | Hum=${fmt(k.humWeighted, 2)}% | Rec=${fmt(k.recWeighted, 2)}% | Sel=${lotesSel.length}`,
          marginX,
          headerH + 38
        );

        const tot = totalsForExport(lotesSel);

        autoTable(doc, {
          head,
          body: makeBodyRows(lotesSel),
          foot: [
            [
              "",
              "SUBTOTAL",
              `(${lotesSel.length} sel)`,
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

      if (!printedAny) {
        alert("No hay lotes seleccionados en las pilas para exportar.");
        return;
      }

      const fname = `Export_${view === "1" ? "Resultado1" : view === "2" ? "Resultado2" : "Resultado3"}_${dateStr.replaceAll("/", "-")}.pdf`;
      doc.save(fname);
    } catch (e: any) {
      alert(e?.message || "Error exportando");
    } finally {
      setExportPdfLoading(false);
    }
  }

  // ✅ EXPORT EXCEL (solo seleccionados)
  async function exportCurrentToExcel() {
    setExportExcelLoading(true);
    try {
      const selectedNow = filterSelected(flatCurrentRows, sel[view] ?? {});
      if (!selectedNow || selectedNow.length === 0) {
        alert("No hay lotes seleccionados para exportar.");
        return;
      }

      const pileDate = getPileDateFromRows(selectedNow);
      const dateStr = formatDDMMYYYY(pileDate);

      const wb = XLSX.utils.book_new();

      const headerRow = (cols: readonly string[], isLow = false) =>
        cols
          .filter((c) => c !== "sel")
          .map((c) => {
            if (isLow) return (COL_LABEL_LOWREC as any)[c] ?? c;
            return (COL_LABEL as any)[c] ?? c;
          });

      const buildSheetForRows = (params: { title: string; rows: LotRow[]; lowRec?: boolean; kpiText?: string }) => {
        const { title, rows, lowRec, kpiText } = params;

        const cols = (lowRec ? (COLS_LOWREC as unknown as string[]) : (COLS as unknown as string[])).filter((c) => c !== "sel");
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
            `(${rows.length} sel)`,
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

        const baseCols = [
          { wch: 6 },
          { wch: 14 },
          { wch: 16 },
          { wch: 12 },
          { wch: 14 },
          { wch: 12 },
          { wch: 10 },
          { wch: 14 },
          { wch: 10 },
          { wch: 14 },
          { wch: 10 },
          { wch: 14 },
          { wch: 14 },
          { wch: 10 },
        ];
        const colsW = lowRec ? [...baseCols, { wch: 18 }] : baseCols;
        setColWidths(ws, colsW);

        return ws;
      };

      // ====== Caso: Resultado 4 (TOTAL + por rec_class) SOLO seleccionados ======
      if (view === "4") {
        const sel4 = selectedNow;

        XLSX.utils.book_append_sheet(
          wb,
          buildSheetForRows({
            title: "Baja Recuperación (Seleccionados)",
            rows: sel4,
            lowRec: true,
          }),
          sanitizeSheetName("BajaRec Sel")
        );

        const groups = groupLowRecByClass(sel4).filter((g) => g.rows.length > 0);
        for (const g of groups) {
          XLSX.utils.book_append_sheet(
            wb,
            buildSheetForRows({
              title: `Baja Recuperación – ${g.rec_class} (Sel)`,
              rows: g.rows,
              lowRec: true,
            }),
            sanitizeSheetName(`BR Sel ${g.rec_class}`)
          );
        }

        const fname = `Export_BajaRec_${dateStr.replaceAll("/", "-")}.xlsx`;
        XLSX.writeFile(wb, fname);
        return;
      }

      // ====== Caso: Resultados 1/2/3 (1 hoja por pila) SOLO seleccionados ======
      const piles = current;
      if (!piles || piles.length === 0) {
        alert("Sin datos para exportar.");
        return;
      }

      let appended = 0;

      for (const p of piles) {
        const lotesSel = filterSelected(p.lotes, sel[view] ?? {});
        if (lotesSel.length === 0) continue;

        const k = pileKPIs(lotesSel);
        const kpiText = `TMS=${fmt(k.tmsSum, 1)} | Au=${fmt(k.auWeighted, 2)} g/t | Hum=${fmt(k.humWeighted, 2)}% | Rec=${fmt(k.recWeighted, 2)}% | Sel=${lotesSel.length}`;

        const sheetName = sanitizeSheetName(`Pila ${p.pile_code} ${p.pile_type}`);
        XLSX.utils.book_append_sheet(
          wb,
          buildSheetForRows({
            title: `Pila #${p.pile_code} (${p.pile_type})`,
            rows: lotesSel,
            lowRec: false,
            kpiText,
          }),
          sheetName
        );
        appended++;
      }

      if (appended === 0) {
        alert("No hay lotes seleccionados en las pilas para exportar.");
        return;
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
            {/* ✅ OVERLAY CALCULANDO */}
      {busyCalc && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0, 103, 172, 0.78)", // #0067ac con transparencia
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 14,
          }}
          aria-label="Calculando"
        >
          <img
            src="/loading.png"
            alt="Calculando"
            className="mvd-pulse"
            style={{
              width: 220,
              maxWidth: "70vw",
              height: "auto",
              filter: "drop-shadow(0 10px 24px rgba(0,0,0,.35))",
            }}
          />

          <div style={{ textAlign: "center", maxWidth: 520, padding: "0 18px" }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>
              Calculando. Este proceso puede tardar unos segundos.
            </div>
          </div>
        </div>
      )}

      {/* ✅ animación pulse (solo para overlay) */}
      <style jsx global>{`
        .mvd-pulse {
          animation: mvdPulse 1.05s ease-in-out infinite;
          transform-origin: center;
        }
        @keyframes mvdPulse {
          0% {
            transform: scale(0.92);
            opacity: 0.92;
          }
          50% {
            transform: scale(1.03);
            opacity: 1;
          }
          100% {
            transform: scale(0.92);
            opacity: 0.92;
          }
        }
      `}</style>

      
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo_mvd.png" alt="MVD" style={{ height: 48 }} />
          <h1 style={{ margin: 0 }}>MVD – Calculadora de Blending</h1>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={loadAll}
            disabled={loading || busyCalc}
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
            disabled={etlLoading || busyCalc}
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

          <button
            onClick={exportCurrentToPDF}
            disabled={exportPdfLoading || busyCalc}
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
            title="Exporta SOLO los lotes seleccionados del tab actual a PDF"
          >
            {exportPdfLoading ? "Exportando..." : "Exportar PDF"}
          </button>

          <button
            onClick={exportCurrentToExcel}
            disabled={exportExcelLoading || busyCalc}
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
            title="Exporta SOLO los lotes seleccionados del tab actual a Excel"
          >
            {exportExcelLoading ? "Exportando..." : "Exportar Excel"}
          </button>

          <button
            onClick={handleLogout}
            disabled={busyCalc}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: "#A7D8FF",
              color: "#003A63",
              fontWeight: "bold",
              cursor: busyCalc ? "not-allowed" : "pointer",
              opacity: busyCalc ? 0.75 : 1,
              whiteSpace: "nowrap",
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Universo de Lotes (Tabla) */}
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
    <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)" }}>
      {uniLoading ? "Cargando..." : `Filas: ${uniRows.length}`}
      {uniErr ? <span style={{ color: "#FFD6D6" }}> — ❌ {uniErr}</span> : null}
    </div>
  </div>

  <div style={{ height: 10 }} />

  <UniverseTable rows={uniRows} loading={uniLoading} />
</section>

{/* Subtítulo: Calculadora */}
<div
  style={{
    margin: "8px 0 10px 0",
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: 0.2,
  }}
>
  Calculadora:
</div>


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
          <ZoneDropdown zones={zonesAll} selected={zonesSelected} onToggle={toggleZone} onSelectAll={selectAllZones} />

          <InputRow
            label="TMS mínimo de Lote"
            value={lot_tms_min}
            onChange={setLotTmsMin}
            placeholder={`${DEFAULTS.lot_tms_min}`}
            hint="0 = no filtra"
          />

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

        <div style={{ marginBottom: 10, fontSize: 12, color: "rgba(255,255,255,.80)" }}>
          Seleccionados en este tab: <b>{flatSelectedRows.length}</b> / {flatCurrentRows.length}
        </div>

        {/* ✅ Resultado 4 */}
        {view === "4" && (
          <>
            {/* TOTAL */}
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
                <b>Baja Recuperación (Total)</b>
                <span style={{ color: "rgba(255,255,255,.85)" }}>({r4.length} lotes)</span>
              </div>

              <DataTableLowRec
                rows={r4}
                selected={sel["4"] ?? {}}
                onToggle={(k) => toggleRowSelection("4", k)}
                onSetMany={(keys, v) => setManySelection("4", keys, v)}
              />
            </div>

            {/* POR CLASIFICACIÓN */}
            {lowRecGroups.map((g) => (
              <div
                key={`lowrec-${g.rec_class}`}
                style={{
                  marginBottom: 14,
                  background: "#004F86",
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,.12)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                  <b>Baja Recuperación – {g.rec_class}</b>
                  <span style={{ color: "rgba(255,255,255,.85)" }}>({g.rows.length} lotes)</span>
                </div>

                <DataTableLowRec
                  rows={g.rows}
                  selected={sel["4"] ?? {}}
                  onToggle={(k) => toggleRowSelection("4", k)}
                  onSetMany={(keys, v) => setManySelection("4", keys, v)}
                />
              </div>
            ))}
          </>
        )}

        {/* ✅ Resultados 1/2/3 (con slots para que no desaparezcan) */}
{view !== "4" && (() => {
  const slots =
    pileSlots[view] && pileSlots[view].length > 0
      ? pileSlots[view]
      : current.map((p) => ({ pile_code: p.pile_code, pile_type: p.pile_type }));

  const map = new Map<string, LotRow[]>();
  for (const p of current) map.set(`${p.pile_code}__${p.pile_type}`, p.lotes);

  return slots.map(({ pile_code, pile_type }) => {
    const lotes = map.get(`${pile_code}__${pile_type}`) ?? [];

    const lotesSel = filterSelected(lotes, sel[view] ?? {});
    const k = pileKPIs(lotesSel);
    const total = lotes.length;
    const selCount = lotesSel.length;

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
            Pila #{pile_code} ({pile_type}) — Sel {selCount}/{total}
          </b>

          <span style={{ color: "rgba(255,255,255,.85)" }}>
            TMS={fmt(k.tmsSum, 1)} | Au={fmt(k.auWeighted, 2)} g/t | Hum={fmt(k.humWeighted, 2)}% | Rec={fmt(k.recWeighted, 2)}%
          </span>
        </div>

        <DataTable
          rows={lotes}
          selected={sel[view] ?? {}}
          onToggle={(k) => toggleRowSelection(view, k)}
          onSetMany={(keys, v) => setManySelection(view, keys, v)}
          dndEnabled={view === "1" || view === "2" || view === "3"}
          viewKey={view}
          pileCode={pile_code}
          pileType={pile_type}
          onMoveRow={moveRowBetweenPiles}
        />
      </div>
    );
  });
})()}


        {view !== "4" && (
  <div
    style={{
      marginTop: 14,
      background: "#004F86",
      padding: 12,
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,.12)",
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
      <b>Lotes no usados (vs {viewTitle})</b>
      <span style={{ color: "rgba(255,255,255,.85)" }}>({flatUnusedRows.length} lotes)</span>
    </div>

    <DataTable
  rows={flatUnusedRows}
  selected={selU[view] ?? {}}
  onToggle={(k) => toggleRowSelectionUnused(view, k)}
  onSetMany={(keys, v) => setManySelectionUnused(view, keys, v)}

  // ✅ ahora también en view 1 si quieres DnD ahí
  dndEnabled={view === "1" || view === "2" || view === "3"}
  viewKey={view}

  // ✅ este “pile” representa el destino: NO USADOS
  pileCode={0}
  pileType={"varios"}

  // ✅ AHORA SÍ: vuelve drop target
  onMoveRow={moveRowBetweenPiles}
/>


  </div>
)}

        
        {view !== "4" && current.length === 0 && <p style={{ color: "rgba(255,255,255,.85)" }}>Sin datos.</p>}
        {view === "4" && r4.length === 0 && <p style={{ color: "rgba(255,255,255,.85)" }}>Sin datos.</p>}
      </section>
    </main>
  );
}
