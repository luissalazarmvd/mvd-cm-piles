# runner/main.py
from fastapi import FastAPI, HTTPException, Request
from supabase import create_client, Client
import pandas as pd
import numpy as np

from solver import solve  # <- solver.py (ya acepta payload opcional)

app = FastAPI()

# =========================
# 0) CONFIG / CONEXIÓN (HARDCODE)
# =========================
SUPABASE_URL = "https://iffytelelyatppieocrv.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnl0ZWxlbHlhdHBwaWVvY3J2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Njc2NTQxMiwiZXhwIjoyMDgyMzQxNDEyfQ.w9NHMxOIh2JUsjL6eMAuH0IMEvudMpYFNFG-s8wzVX8"

# Si no quieres auth por header, deja RUNNER_SECRET = "" y no validará nada
RUNNER_SECRET = "mvdRunnerSecret20260112A7f3c9d1e5b8a0c2f4d6e8a1c3e5b7d9"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

OUTPUT_COLS = [
    "pile_code", "pile_type",
    "codigo", "zona",
    "tmh", "humedad_pct", "tms",
    "au_oz_tc", "au_gr_ton", "au_fino",
    "ag_oz_tc", "ag_gr_ton", "ag_fino",
    "cu_pct", "nacn_kg_t", "naoh_kg_t", "rec_pct",
]

@app.get("/health")
def health():
    return {"ok": True}

def auth(req: Request):
    if RUNNER_SECRET:
        got = req.headers.get("x-runner-secret", "")
        if got != RUNNER_SECRET:
            raise HTTPException(status_code=401, detail="unauthorized")

def _to_native(x):
    if x is None:
        return None
    if isinstance(x, (np.floating, np.integer)):
        return x.item()
    return x

def prep_payload(df_out: pd.DataFrame) -> list[dict]:
    if df_out is None or df_out.empty:
        return []
    d = df_out.copy()

    # asegura columnas
    for c in OUTPUT_COLS:
        if c not in d.columns:
            d[c] = None

    d = d[OUTPUT_COLS].replace({np.nan: None})
    payload = d.to_dict(orient="records")
    payload = [{k: _to_native(v) for k, v in row.items()} for row in payload]
    return payload

def delete_all(table_name: str):
    supabase.table(table_name).delete().neq("id", -1).execute()

def insert_chunks(table_name: str, payload: list[dict], chunk_size: int = 500) -> int:
    if not payload:
        return 0
    total = 0
    for i in range(0, len(payload), chunk_size):
        chunk = payload[i:i + chunk_size]
        resp = supabase.table(table_name).insert(chunk).execute()
        total += len(resp.data or [])
    return total

@app.post("/run")
async def run(req: Request):
    auth(req)

    # 0) leer payload UI (si viene). Si no viene o es inválido, queda {}
    payload = {}
    try:
        payload = await req.json()
        if not isinstance(payload, dict):
            payload = {}
    except:
        payload = {}

    # 1) leer input
    resp = supabase.table("stg_lotes_daily").select("*").execute()
    rows = resp.data or []
    if not rows:
        return {"ok": False, "error": "stg_lotes_daily vacío"}

    df = pd.DataFrame(rows)

    # 2) correr solver (con payload opcional)
    p1, p2, p3 = solve(df, payload)

    # 3) preparar payloads
    payload_1 = prep_payload(p1)
    payload_2 = prep_payload(p2)
    payload_3 = prep_payload(p3)

    # 4) delete + insert
    delete_all("res_pila_1")
    delete_all("res_pila_2")
    delete_all("res_pila_3")

    ins1 = insert_chunks("res_pila_1", payload_1)
    ins2 = insert_chunks("res_pila_2", payload_2)
    ins3 = insert_chunks("res_pila_3", payload_3)

    return {
        "ok": True,
        "inserted": {"p1": ins1, "p2": ins2, "p3": ins3},
        "payload_used": payload,  # te sirve para debug (si no quieres, bórralo)
    }
