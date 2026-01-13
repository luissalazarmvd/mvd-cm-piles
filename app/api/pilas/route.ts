// app/api/pilas/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getTable(which: string | null) {
  if (which === "1") return "res_pila_1";
  if (which === "2") return "res_pila_2";
  if (which === "3") return "res_pila_3";
  if (which === "4") return "res_pila_4"; // ✅ baja recuperación
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

  // ✅ ahora acepta 1..4
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

    // ✅ Resultado 4 no necesariamente tiene pile_code (o puede ser null)
    // Entonces: orden condicional
    let q = supabase.from(table).select("*").order("id", { ascending: true });

    if (which !== "4") {
      q = supabase.from(table).select("*").order("pile_code", { ascending: true }).order("id", { ascending: true });
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
