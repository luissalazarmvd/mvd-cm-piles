// app/api/pilas/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getTable(which: string | null) {
  if (which === "1") return "res_pila_1";
  if (which === "2") return "res_pila_2";
  if (which === "3") return "res_pila_3";
  if (which === "4") return "stg_lotes_daily_rec";
  return null;
}

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  return { url, key };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const which = searchParams.get("which");

  if (!which || !["1", "2", "3", "4"].includes(which)) {
    return NextResponse.json({ error: "which debe ser 1, 2, 3 o 4" }, { status: 400 });
  }

  const table = getTable(which);
  if (!table) {
    return NextResponse.json({ error: "Tabla inválida" }, { status: 400 });
  }

  const { url, key } = getSupabaseEnv();
  if (!url || !key) {
    return NextResponse.json(
      { error: "Faltan envs SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY" },
      { status: 500 }
    );
  }

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // ✅ Query base
    let q = supabase.from(table).select("*");

    // ✅ Resultados 1/2/3: tienen pile_code + id
    if (which !== "4") {
      q = q.order("pile_code", { ascending: true }).order("id", { ascending: true });
    } else {
      // ✅ Resultado 4: NO tiene id; ordenar por clasificación
      // (y luego por rec_pct asc para ver los peores primero, opcional)
      q = q
        .order("rec_class", { ascending: true, nullsFirst: false })
        .order("rec_pct", { ascending: true, nullsFirst: false })
        .order("loaded_at", { ascending: false })
        .order("codigo", { ascending: true });
    }

    const { data, error } = await q;

    if (error) {
      return NextResponse.json({ error: "Error leyendo Supabase", details: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    return NextResponse.json({ which, table, count: rows.length, rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
