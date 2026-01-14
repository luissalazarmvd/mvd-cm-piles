// app/api/unused/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getTable(which: string | null) {
  if (which === "1") return "res_pila_1";
  if (which === "2") return "res_pila_2";
  if (which === "3") return "res_pila_3";
  return null;
}

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  return { url, key };
}

function toPgInListText(vals: string[]) {
  // ("A","B","C") con escaping seguro
  const body = vals.map((v) => JSON.stringify(v)).join(",");
  return `(${body})`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const which = searchParams.get("which");

  if (!which || !["1", "2", "3"].includes(which)) {
    return NextResponse.json({ error: "which debe ser 1, 2 o 3" }, { status: 400 });
  }

  const table = getTable(which);
  if (!table) return NextResponse.json({ error: "Tabla inválida" }, { status: 400 });

  const { url, key } = getSupabaseEnv();
  if (!url || !key) {
    return NextResponse.json(
      { error: "Faltan envs SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY" },
      { status: 500 }
    );
  }

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // 1) Códigos usados en ese resultado
    const usedRes = await supabase.from(table).select("codigo");
    if (usedRes.error) {
      return NextResponse.json({ error: "Error leyendo usados", details: usedRes.error.message }, { status: 500 });
    }

    const usedCodes = (usedRes.data ?? [])
      .map((r: any) => (r?.codigo ?? "").toString().trim())
      .filter(Boolean);

    // 2) Traer NO usados desde staging
    let q = supabase.from("stg_lotes_daily").select("*");

    if (usedCodes.length > 0) {
      q = q.not("codigo", "in", toPgInListText(usedCodes));
    }

    // orden simple
    q = q.order("zona", { ascending: true }).order("codigo", { ascending: true }).order("loaded_at", { ascending: false });

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: "Error leyendo no usados", details: error.message }, { status: 500 });
    }

    return NextResponse.json({ which, used: usedCodes.length, count: (data ?? []).length, rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}