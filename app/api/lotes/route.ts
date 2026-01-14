// app/api/lotes/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // service role (solo server)
);

export async function GET() {
  const { data, error } = await supabase
    .from("stg_lotes_daily")
    .select(
      "codigo,zona,tmh,humedad_pct,tms,au_gr_ton,cu_pct,rec_pct,naoh_kg_t,nacn_kg_t,loaded_at,created_at"
    )
    .order("zona", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] });
}
