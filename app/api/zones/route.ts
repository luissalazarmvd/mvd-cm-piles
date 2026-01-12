import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) throw new Error("Faltan envs de Supabase (SUPABASE_URL y KEY).");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  try {
    const supabase = getSupabase();

    // 1) último loaded_at (si existe)
    const last = await supabase
      .from("stg_lotes_daily")
      .select("loaded_at")
      .not("loaded_at", "is", null)
      .order("loaded_at", { ascending: false })
      .limit(1);

    if (last.error) throw last.error;

    const lastLoadedAt = last.data?.[0]?.loaded_at as string | undefined;

    // 2) traer zonas del último snapshot si hay loaded_at; si no, de todo
    const q = supabase.from("stg_lotes_daily").select("zona");
    const resp = lastLoadedAt ? await q.eq("loaded_at", lastLoadedAt) : await q;

    if (resp.error) throw resp.error;

    const zonesRaw = (resp.data || [])
      .map((r: any) => String(r?.zona ?? "").trim())
      .filter((z: string) => z.length > 0);

    const seen = new Set<string>();
    const zones = zonesRaw.filter((z: string) => {
      const k = z.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    zones.sort((a, b) => a.localeCompare(b, "es"));

    return NextResponse.json({ zones });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
