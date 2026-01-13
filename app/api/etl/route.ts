// app/api/etl/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Este endpoint es POST. Usa POST /api/etl para ejecutar el ETL.",
  });
}

export async function POST(req: Request) {
  // payload opcional (por si luego quieres pasar flags)
  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const base = process.env.RUNNER_URL;
  if (!base) {
    return NextResponse.json({ error: "Falta RUNNER_URL en Vercel" }, { status: 500 });
  }

  const secret = process.env.RUNNER_SECRET ?? "";

  let r: Response;
  try {
    r = await fetch(`${base.replace(/\/+$/, "")}/etl`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-runner-secret": secret,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "No se pudo conectar al runner", details: e?.message || String(e) },
      { status: 502 }
    );
  }

  const text = await r.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: "Runner no devolvió JSON", raw: text?.slice(0, 500) };
  }

  return NextResponse.json(data, { status: r.status });
}
