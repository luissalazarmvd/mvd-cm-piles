import { NextResponse } from "next/server";
import { Client } from "pg";

function getCa() {
  const v = process.env.COCKROACH_CA_CERT;
  if (!v) return undefined;
  // si lo pegaste con \n literales
  return v.includes("\\n") ? v.replace(/\\n/g, "\n") : v;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const which = searchParams.get("which");

  const table =
    which === "1" ? "res_pila_1" :
    which === "2" ? "res_pila_2" :
    which === "3" ? "res_pila_3" : null;

  if (!table) {
    return NextResponse.json({ error: "which debe ser 1, 2 o 3" }, { status: 400 });
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL!,
    ssl: { ca: getCa(), rejectUnauthorized: true },
  });

  try {
    await client.connect();
    const r = await client.query(`SELECT * FROM ${table} ORDER BY pile_code, pile_type, id`);
    return NextResponse.json(r.rows);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "DB error" }, { status: 500 });
  } finally {
    try { await client.end(); } catch {}
  }
}
