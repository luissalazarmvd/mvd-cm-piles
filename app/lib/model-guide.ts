// app/lib/model-guide.ts
// Guía de interpretación (cuanti) para generar comentario IA
// Prioriza: paper de gold–silver mean reversion + ML regime filter (estable vs inestable)
// y lo adapta a tu dashboard (signal/prob/zscore + macro + forecast Au).

type CommentJSON = {
  comentario: string; // 1 párrafo, sin bullets
  riesgos: string;    // "Riesgos: ...; ..."
  confianza: "Baja" | "Media" | "Alta";
};

export const COMMENT_JSON_SCHEMA = {
  name: "comment_schema_text_only",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      titulo: { type: "string", minLength: 4, maxLength: 60 },
      comentario: { type: "string", minLength: 40 },
      riesgos: { type: "string", minLength: 10 },
      confianza: { type: "string", enum: ["Baja", "Media", "Alta"] },
    },
    required: ["titulo", "comentario", "riesgos", "confianza"],
  },
};


// =========================
// Helpers numéricos / fechas
// =========================
export function safeNumber(n: any): number | null {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

export function safeDateStr(d: any): string | null {
  const s = typeof d === "string" ? d : null;
  // admite "YYYY-MM-DD" o "YYYY-MM-DDTHH..."
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function daysBetween(a?: string | null, b?: string | null): number | null {
  const da = a ? new Date(a) : null;
  const db = b ? new Date(b) : null;
  if (!da || !db || Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  const ms = db.getTime() - da.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function pctChange(from: number | null, to: number | null): number | null {
  if (from == null || to == null) return null;
  if (from === 0) return null;
  return ((to - from) / from) * 100;
}

function round2(x: number | null): number | null {
  if (x == null) return null;
  return Math.round(x * 100) / 100;
}

function fmtNum(x: number | null, digits = 2): string {
  if (x == null) return "sin dato";
  const p = Math.pow(10, digits);
  return String(Math.round(x * p) / p);
}

function fmtPct(x: number | null, digits = 2): string {
  if (x == null) return "sin dato";
  const p = Math.pow(10, digits);
  const v = Math.round(x * p) / p;
  return `${v}%`;
}

function strOrNA(s: any): string {
  const v = typeof s === "string" && s.trim() ? s.trim() : "sin dato";
  return v;
}

// =========================
// Lógica interpretativa (paper-first)
// =========================
//
// Paper: el z-score mide desviación del spread normalizado; la señal “tradable” se valida
// con un "regime filter" (estable vs inestable) usando features macro/volatilidad.
// En tu implementación, ese "gate" ya está resumido en signal/probability + vix_regime.
// Entonces:
// - z_abs: magnitud del desequilibrio (intensidad)
// - probability + vix_regime/VIX: calidad del régimen (estable/inestable)
// - signal: acción discreta ya filtrada (cuando pasa umbral); si signal=0 pero z_abs alto => presión/pre-señal.

export type SnapshotLike = {
  asof?: string | null;
  model?: { name?: string | null; version?: string | null } | null;
  scenarios?: {
    signal?: number | null;
    probability?: number | null;
    zscore?: number | null;
    z_abs?: number | null;
    z_delta_vs_prev_event?: number | null;
    spread_value?: number | null;
    spread_bias?: string | null;
    market_scenario?: string | null;
    deviation_intensity?: string | null;
    confidence_level?: string | null;
    prev_event_date?: string | null;
    days_since_prev_event?: number | null;
    pressure_label?: string | null;
    confidence_op?: "Baja" | "Media" | "Alta" | null;
  } | null;
  macro?: {
    vix?: number | null;
    dxy?: number | null;
    y10?: number | null;
    vix_regime?: string | null;
  } | null;
  gold?: {
    last_close_date?: string | null;
    last_close?: number | null;
    ret_7d_pct?: number | null;
    ret_30d_pct?: number | null;
    next_forecast_date?: string | null;
    next_p50?: number | null;
    next_p10?: number | null;
    next_p90?: number | null;
    next_pct_vs_last_close?: number | null;
    band_width_abs?: number | null;
    band_width_pct_of_last?: number | null;
    base_date?: string | null;
    run_date?: string | null;
  } | null;
};

// Clasifica “estabilidad” estilo paper (regime filter) usando lo que tienes disponible
export function inferRegime(snapshot: SnapshotLike): {
  regime: "Estable" | "Inestable" | "Mixto" | "Sin dato";
  why: string[];
} {
  const vix = safeNumber(snapshot?.macro?.vix);
  const vixReg = snapshot?.macro?.vix_regime ? String(snapshot.macro.vix_regime) : "";
  const prob = safeNumber(snapshot?.scenarios?.probability);

  const why: string[] = [];

  const vixStressed =
    (vix != null && vix >= 25) ||
    /HIGH/i.test(vixReg);

  const vixCalm =
    (vix != null && vix <= 18) ||
    /LOW/i.test(vixReg);

  if (vixStressed) why.push(`VIX elevado (${fmtNum(vix, 2)}) o régimen HIGH`);
  if (vixCalm) why.push(`VIX bajo/moderado (${fmtNum(vix, 2)}) o régimen LOW`);

  // prob como proxy de “gate ML” (paper: classifier estable=1)
  const probStrong = prob != null && prob >= 0.7;
  const probWeak = prob != null && prob < 0.6;

  if (probStrong) why.push(`probabilidad alta (${fmtNum(prob, 3)})`);
  if (probWeak) why.push(`probabilidad baja (${fmtNum(prob, 3)})`);

  if (vix == null && !vixReg && prob == null) return { regime: "Sin dato", why: ["macro/signal sin dato"] };

  // regla simple:
  if (vixCalm && probStrong) return { regime: "Estable", why };
  if (vixStressed && probWeak) return { regime: "Inestable", why };

  return { regime: "Mixto", why };
}

export function inferPressure(snapshot: SnapshotLike): {
  pressure: "Extrema" | "Alta" | "Moderada" | "Baja" | "Sin dato";
  label: string;
} {
  const z = safeNumber(snapshot?.scenarios?.zscore);
  const zAbs = safeNumber(snapshot?.scenarios?.z_abs) ?? (z != null ? Math.abs(z) : null);

  if (zAbs == null) return { pressure: "Sin dato", label: "sin dato" };

  // paper usa ±1σ como umbral base y comenta que crisis suele exceder ±2σ
  if (zAbs >= 2.0) return { pressure: "Extrema", label: `|z|=${fmtNum(zAbs, 2)} (≥2σ)` };
  if (zAbs >= 1.5) return { pressure: "Alta", label: `|z|=${fmtNum(zAbs, 2)} (1.5–2σ)` };
  if (zAbs >= 1.0) return { pressure: "Moderada", label: `|z|=${fmtNum(zAbs, 2)} (1–1.5σ)` };
  return { pressure: "Baja", label: `|z|=${fmtNum(zAbs, 2)} (<1σ)` };
}

export function inferSignalNarrative(snapshot: SnapshotLike): {
  core: string;
  nuance: string[];
} {
  const signal = safeNumber(snapshot?.scenarios?.signal);
  const prob = safeNumber(snapshot?.scenarios?.probability);
  const { regime, why } = inferRegime(snapshot);
  const { pressure, label } = inferPressure(snapshot);

  const nuance: string[] = [];

  if (signal === 1) {
    nuance.push("Señal activa (1): condición consistente con ventana de reversión favorable (gate estable).");
  } else if (signal === -1) {
    nuance.push("Señal activa (-1): condición consistente con ventana de reversión desfavorable / riesgo elevado.");
  } else if (signal === 0) {
    nuance.push("Sin señal discreta (0): el gate no valida acción (o no se alcanzó umbral).");
  } else {
    nuance.push("Señal: sin dato.");
  }

  if (signal === 0 && (pressure === "Alta" || pressure === "Extrema")) {
    nuance.push(`Presión estadística ${pressure.toLowerCase()} ${label} sin confirmación del gate (pre-señal).`);
  } else if (pressure !== "Sin dato") {
    nuance.push(`Presión estadística: ${pressure} (${label}).`);
  }

  if (prob != null) nuance.push(`Probabilidad: ${fmtNum(prob, 3)}.`);
  nuance.push(`Régimen (proxy ML): ${regime}${why.length ? ` — ${why.join("; ")}` : ""}.`);

  let core = "Lectura: ";
  if (signal === 1) core += "escenario favorable filtrado por régimen.";
  else if (signal === -1) core += "escenario desfavorable filtrado por régimen.";
  else if (signal === 0) core += "sin confirmación de señal; evaluar presión y macro.";
  else core += "sin dato de señal.";

  return { core, nuance };
}

export function inferGoldNarrative(snapshot: SnapshotLike): {
  line: string;
  details: string[];
} {
  const g = snapshot?.gold ?? null;
  const last = safeNumber(g?.last_close);
  const lastD = safeDateStr(g?.last_close_date);
  const p50 = safeNumber(g?.next_p50);
  const p10 = safeNumber(g?.next_p10);
  const p90 = safeNumber(g?.next_p90);
  const fD = safeDateStr(g?.next_forecast_date);

  const ret7 = safeNumber(g?.ret_7d_pct);
  const ret30 = safeNumber(g?.ret_30d_pct);
  const fcPct = safeNumber(g?.next_pct_vs_last_close);

  const bwPct = safeNumber(g?.band_width_pct_of_last);
  const bwAbs = safeNumber(g?.band_width_abs);

  const details: string[] = [];

  if (last != null && lastD) details.push(`Último close: ${fmtNum(last, 2)} (fecha ${lastD}).`);
  else details.push("Último close: sin dato.");

  if (ret7 != null) details.push(`Retorno 7D: ${fmtPct(round2(ret7), 2)}.`);
  if (ret30 != null) details.push(`Retorno 30D: ${fmtPct(round2(ret30), 2)}.`);

  if (p50 != null && fD) {
    details.push(
      `Forecast próximo (${fD}): P50=${fmtNum(p50, 2)}${
        p10 != null && p90 != null ? ` (P10=${fmtNum(p10, 2)}, P90=${fmtNum(p90, 2)})` : ""
      }.`
    );
  } else {
    details.push("Forecast próximo: sin dato.");
  }

  if (fcPct != null) details.push(`Diferencia P50 vs último close: ${fmtPct(round2(fcPct), 2)}.`);
  if (bwAbs != null) details.push(`Ancho banda (P90–P10): ${fmtNum(bwAbs, 2)}.`);
  if (bwPct != null) details.push(`Ancho banda vs último close: ${fmtPct(round2(bwPct), 2)}.`);

  const line =
    p50 != null
      ? `Au: lectura por rango (P10–P90) con centro P50; evitar lectura puntual.`
      : `Au: sin forecast; solo lectura de último close y retornos.`;

  return { line, details };
}

// =========================
// Prompt builder
// =========================
export function buildCommentPrompt(snapshot: SnapshotLike) {
  const { core, nuance } = inferSignalNarrative(snapshot);
  const { line: goldLine, details: goldDetails } = inferGoldNarrative(snapshot);

  const vix = safeNumber(snapshot?.macro?.vix);
  const dxy = safeNumber(snapshot?.macro?.dxy);
  const y10 = safeNumber(snapshot?.macro?.y10);

  const notes = {
    model_reading: core,
    bullets_hint: nuance,
    gold_hint: goldLine,
    gold_numbers: goldDetails,
    macro_numbers: {
      vix: vix != null ? fmtNum(vix, 2) : "sin dato",
      dxy: dxy != null ? fmtNum(dxy, 3) : "sin dato",
      y10: y10 != null ? fmtNum(y10, 3) : "sin dato",
      vix_regime: strOrNA(snapshot?.macro?.vix_regime),
    },
  };

  const sys = `
Eres analista para un dashboard usado por Gerencia General y Finanzas.

Contexto:
- La empresa se dedica al acopio y procesamiento de mineral aurífero de terceros (sin extracción).
- El texto debe ayudar a definir postura de negociación con proveedores (Conservadora/Neutral/Flexible).
- NO es trading.

Reglas:
- No inventes datos. Si falta, escribe exactamente "sin dato".
- No uses jerga técnica.
- PROHIBIDO usar estas palabras o equivalentes: "gate", "filtro", "regime filter", "clasificador", "trigger", "threshold".
  En su lugar usa: "sin confirmación de señal", "señal no validada", "sin confirmación estadística suficiente".
- No menciones “régimen VIX”. Si usas VIX, dilo como “índice de volatilidad del S&P 500 (VIX)”.
- No menciones temas operativos (abastecimiento/flujo/logística) salvo que el snapshot lo traiga explícito.
- No escribas "Lectura:" ni "Comentario:" ni "Riesgos:" dentro del comentario (solo en sus líneas respectivas).
- En riesgos: SIEMPRE exactamente 2 riesgos, separados por "; " (punto y coma + espacio). No uses "·".

Enfoque de negocio (obligatorio):
- Si la postura es Conservadora, debes mencionar explícitamente "proteger margen" y "condiciones comerciales" (ej: castigos, descuentos, payables, límites).
- El comentario debe justificar la postura con 2 ideas: (1) presión estadística (|z| y prob) y (2) el forecast de Au (P50 vs close).
- Mantén tono gerencial: negociación, precios de referencia, riesgo de margen, prudencia en condiciones.

Confianza (solo por probabilidad del snapshot):
- Baja: prob < 0.6 o sin dato
- Media: 0.6 <= prob < 0.8
- Alta: prob >= 0.8
(IMPORTANTE: la línea de confianza debe ser SOLO "Confianza: Baja/Media/Alta". La prob se mostrará fuera del modelo.)

Formato numérico obligatorio:
- |z| SIEMPRE con 2 decimales (ej: 2.24). Usa el valor absoluto.
- probabilidad SIEMPRE en porcentaje con 1 decimal en el comentario (ej: 1.3%).
- % de variación P50 vs último close con 1 decimal (ej: -2.8%).
- Precios (USD) con 2 decimales.

Forecast Au:
- Si mencionas forecast de Au, DEBES indicar la fecha exacta next_forecast_date (YYYY-MM-DD). Si falta: "fecha: sin dato".
- Debes incluir P50 vs último close y el rango P10–P90.

FORMATO OBLIGATORIO (exactamente 4 líneas, sin bullets, sin líneas en blanco):
0) Título: DEBE ser exactamente uno de estos 3 (elige 1 según el caso):
- "Postura Conservadora – Au"
- "Postura Neutral – Au"
- "Postura Flexible – Au"
No inventes otros títulos.
1) Comentario: un SOLO párrafo, y debe iniciar EXACTAMENTE así:
   "En base a |z|=__ y probabilidad __, se sugiere mantener una postura __"
   Luego agrega 2–3 frases (máximo) con “un poco más de floro” orientado a negocio:
   - Debe incluir: proteger margen + condiciones comerciales (castigos/descuentos/límites).
   - Debe evitar jerga.
   Luego SIEMPRE incluye (en la misma línea):
   "La proyección de oro para YYYY-MM-DD sugiere una baja/alza estimada de ~X% al P50, con P50=____ USD vs último close ____ USD (≈ X%). El rango P10–P90 es ____–____ USD."
   Si falta algo: usa "sin dato" solo en esa parte, manteniendo la frase.
2) Riesgos: "Riesgos: <riesgo1>; <riesgo2>"
3) Confianza: "Confianza: Baja" o "Confianza: Media" o "Confianza: Alta"
`.trim();


  const user = `
Genera el comentario para gerencia usando SOLO este snapshot JSON.
Piensa con todos los indicadores, pero escribe SIMPLE y corto.
Snapshot:
${JSON.stringify(snapshot)}
`.trim();

  const userWithNotes = `
${user}

Notas:
${JSON.stringify(notes)}
`.trim();

  return {
    system: sys,
    user: userWithNotes,
    schema: COMMENT_JSON_SCHEMA,
  };
}
