// app/api/run/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const payload = await req.json(); // lo que te mande tu UI

  const r = await fetch(`${process.env.RUNNER_URL}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-runner-secret": process.env.RUNNER_SECRET ?? "",
    },
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}
