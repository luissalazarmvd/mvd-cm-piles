// app/api/comment/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { openai } from "@/app/lib/openai";
import { buildCommentPrompt } from "@/app/lib/model-guide";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CommentJSON = {
  headline: string;
  bullets: string[];
  interpretation: string;
  risks: string[];
  confidence: "Baja" | "Media" | "Alta";
};

function safeNumber(n: any) {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

function safeDateStr(d: any) {
  const s = typeof d === "string" ? d : null;
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

function daysBetween(a?: string | null, b?: string | null) {
  const da = a ? new Date(a) : null;
  const db = b ? new Date(b) : null;
  if (!da || !db || Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  const ms = db.getTime() - da.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function pctChange(from: number | null, to: number | null) {
  if (from == null || to == null) return null;
  if (from === 0) return null;
  return ((to - from) / from) * 100;
}

function classifyZPressure(signal: number | null, zAbs: number | null) {
  // “pre-señal”: signal=0 pero z se está yendo a zonas altas
  if (signal === 0 && zAbs != null) {
    if (zAbs >= 2.0) return "Presión extrema sin señal (pre-señal fuerte)";
    if (zAbs >= 1.5) return "Presión alta sin señal (pre-señal)";
    if (zAbs >= 1.0) return "Presión moderada sin señal";
  }
  return null;
}

function mapConfidence(prob: number | null): "Baja" | "Media" | "Alta" {
  if (prob == null) return "Baja";
  if (prob >= 0.8) return "Alta";
  if (prob >= 0.65) return "Media";
  return "Baja";
}

function degradeConfidence(
  base: "Baja" | "Media" | "Alta",
  vix: number | null,
  vixRegime?: string | null
): "Baja" | "Media" | "Alta" {
  const stressed = (vix != null && vix >= 25) || (vixRegime && /HIGH/i.test(vixRegime));
  if (!stressed) return base;
  if (base === "Alta") return "Media";
  if (base === "Media") return "Baja";
  return "Baja";
}

export async function GET() {
  try {
    const sb = supabaseServer();

    // =========================
    // 1) Market scenario (últimos eventos)
    // =========================
    const { data: scen, error: e1 } = await sb
      .from("market_scenarios_daily")
      .select("*")
      .order("obs_date", { ascending: false })
      .limit(5);

    if (e1) throw e1;

    const s0 = scen?.[0];
    if (!s0) {
      return NextResponse.json(
        { error: "No hay data en market_scenarios_daily" },
        { status: 400 }
      );
    }

    const s1 = scen?.[1] ?? null;

    const obs0 = safeDateStr(s0.obs_date);
    const obs1 = s1 ? safeDateStr(s1.obs_date) : null;

    const signal0 = safeNumber(s0.signal);
    const prob0 = safeNumber(s0.probability);
    const z0 = safeNumber(s0.zscore);
    const zAbs0 = z0 != null ? Math.abs(z0) : safeNumber(s0.z_abs);

    const vix0 = safeNumber(s0.vix);
    const dxy0 = safeNumber(s0.dxy);
    const y10_0 = safeNumber(s0.y10);

    const spreadBias =
      z0 == null
        ? null
        : z0 < 0
        ? "Spread comprimido (z<0)"
        : z0 > 0
        ? "Spread expandido (z>0)"
        : "Neutro (z≈0)";

    const pressureLabel = classifyZPressure(signal0, zAbs0);
    const deltaZ =
      s1 && z0 != null && safeNumber(s1.zscore) != null
        ? z0 - (safeNumber(s1.zscore) as number)
        : null;

    const daysSincePrevEvent = obs1 && obs0 ? daysBetween(obs1, obs0) : null;

    // =========================
    // 2) Gold actual (ventana corta para retornos)
    // =========================
    const { data: act30, error: e2 } = await sb
      .from("gold_price_forecast_bi")
      .select("*")
      .eq("model_name", "actual_daily")
      .order("forecast_date", { ascending: false })
      .limit(35);

    if (e2) throw e2;

    const a0 = act30?.[0] ?? null;
    const lastCloseDate = a0 ? safeDateStr(a0.forecast_date) : null;
    const lastClose = a0 ? safeNumber(a0.price_p50 ?? a0.price_mean) : null;

    const p7 =
      act30 && act30.length >= 8
        ? safeNumber(act30[7]?.price_p50 ?? act30[7]?.price_mean)
        : null;

    const p30 =
      act30 && act30.length >= 31
        ? safeNumber(act30[30]?.price_p50 ?? act30[30]?.price_mean)
        : null;

    const ret7 = pctChange(p7, lastClose);
    const ret30 = pctChange(p30, lastClose);

    // =========================
    // 3) Gold forecast (próximo punto futuro p50 + banda)
    // =========================
    const cutDate = lastCloseDate ?? "1900-01-01";

    const { data: fut, error: e3 } = await sb
      .from("gold_price_forecast_bi")
      .select("*")
      .neq("model_name", "actual_daily")
      .gt("forecast_date", cutDate)
      .order("forecast_date", { ascending: true })
      .limit(3);

    if (e3) throw e3;

    const f0 = fut?.[0] ?? null;

    const nextFcDate = f0 ? safeDateStr(f0.forecast_date) : null;
    const nextP50 = f0 ? safeNumber(f0.price_p50 ?? f0.price_mean) : null;
    const nextP10 = f0 ? safeNumber(f0.price_p10) : null;
    const nextP90 = f0 ? safeNumber(f0.price_p90) : null;

    const fcPctVsLast = pctChange(lastClose, nextP50);

    const bandWidthAbs =
      nextP10 != null && nextP90 != null ? nextP90 - nextP10 : null;

    const bandWidthPct =
      lastClose != null && bandWidthAbs != null ? (bandWidthAbs / lastClose) * 100 : null;

    // =========================
    // 4) Confianza operativa
    // =========================
    const baseConf = mapConfidence(prob0);
    const opConf = degradeConfidence(baseConf, vix0, s0.vix_regime ?? null);

    // =========================
    // 5) Snapshot enriquecido
    // =========================
    const snapshot = {
      asof: obs0,
      model: { name: s0.model_name, version: s0.model_version },

      scenarios: {
        signal: signal0,
        probability: prob0,
        confidence_op: opConf,

        zscore: z0,
        z_abs: zAbs0,
        z_delta_vs_prev_event: deltaZ,

        spread_value: safeNumber(s0.spread_value),
        spread_bias: spreadBias,

        market_scenario: s0.market_scenario,
        deviation_intensity: s0.deviation_intensity,
        confidence_level: s0.confidence_level,

        prev_event_date: obs1,
        days_since_prev_event: daysSincePrevEvent,
        pressure_label: pressureLabel,
      },

      macro: {
        vix: vix0,
        dxy: dxy0,
        y10: y10_0,
        vix_regime: s0.vix_regime ?? null,
      },

      gold: {
        last_close_date: lastCloseDate,
        last_close: lastClose,
        ret_7d_pct: ret7,
        ret_30d_pct: ret30,

        next_forecast_date: nextFcDate,
        next_p50: nextP50,
        next_p10: nextP10,
        next_p90: nextP90,

        next_pct_vs_last_close: fcPctVsLast,
        band_width_abs: bandWidthAbs,
        band_width_pct_of_last: bandWidthPct,

        base_date: f0?.base_date ?? null,
        run_date: f0?.run_date ?? null,
      },
    };

    // =========================
    // 6) Prompt desde model-guide (paper-first)
    // =========================
    const model = process.env.OPENAI_COMMENT_MODEL || "gpt-5-mini";
    const { system, user, schema } = buildCommentPrompt(snapshot);

    const r = await openai.responses.create({
  model,
  input: [
    { role: "system", content: sys },
    { role: "user", content: user },
  ],
  text: {
    format: {
      type: "json_schema",
      name: schema.name ?? "comment_schema",
      strict: true,
      schema: schema.schema,
    },
  },
});


    const text = r.output_text?.trim();
    if (!text) throw new Error("OpenAI returned empty output_text");

    const parsed: CommentJSON = JSON.parse(text);

    return NextResponse.json({ snapshot, comment: parsed });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Error desconocido" },
      { status: 500 }
    );
  }
}
