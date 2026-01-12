// app/api/run/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Para que al abrir /api/run en navegador no te tire 405
  return NextResponse.json({
    ok: true,
    message: "Este endpoint es POST. Usa POST /api/run para ejecutar el runner.",
  });
}

export async function POST(req: Request) {
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
    r = await fetch(`${base.replace(/\/+$/, "")}/run`, {
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

  // El runner a veces puede devolver texto si revienta: maneja ambos
  const text = await r.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: "Runner no devolvió JSON", raw: text?.slice(0, 500) };
  }

  return NextResponse.json(data, { status: r.status });
}
