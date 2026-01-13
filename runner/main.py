from fastapi import FastAPI, HTTPException, Request
from supabase import create_client, Client
import pandas as pd
import numpy as np
import math
from datetime import datetime, date

from solver import solve  # solver.py (retorna p1, p2, p3, rej_lowrec)

app = FastAPI()

# =========================
# 0) CONFIG / CONEXIÓN (HARDCODE)  <-- NO TOCAR LÓGICA
# =========================
SUPABASE_URL = "https://iffytelelyatppieocrv.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZnl0ZWxlbHlhdHBwaWVvY3J2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Njc2NTQxMiwiZXhwIjoyMDgyMzQxNDEyfQ.w9NHMxOIh2JUsjL6eMAuH0IMEvudMpYFNFG-s8wzVX8"  # <- deja tu key real acá

# Si no quieres auth por header, deja RUNNER_SECRET = "" y no validará nada
RUNNER_SECRET = "mvdRunnerSecret20260112A7f3c9d1e5b8a0c2f4d6e8a1c3e5b7d9"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# =========================
# 1) OUTPUTS del solver (igual que antes)
# =========================
OUTPUT_COLS = [
    "pile_code", "pile_type",
    "codigo", "zona",
    "tmh", "humedad_pct", "tms",
    "au_oz_tc", "au_gr_ton", "au_fino",
    "ag_oz_tc", "ag_gr_ton", "ag_fino",
    "cu_pct", "nacn_kg_t", "naoh_kg_t", "rec_pct",
]

# NUEVO: tabla de "rechazados por baja rec" (stg + rec_class)
REJ_TABLE = "stg_lotes_daily_rec"
REJ_COLS = [
    "codigo", "zona", "tmh", "humedad_pct", "tms",
    "au_oz_tc", "au_gr_ton", "au_fino",
    "ag_oz_tc", "ag_gr_ton", "ag_fino",
    "cu_pct", "nacn_kg_t", "naoh_kg_t", "rec_pct",
    "rec_class",
    "loaded_at",
]

# =========================
# 2) ETL (Sheets -> stg_lotes_daily)
# =========================
SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTcdo7w_95mj8y1UuknvR5cS7EfCH5yOUl2umOUtFyn-lUlCKr_oJyHoDjkoNcjamJRRlDY0wtBQ5QE/pub?gid=2143480377&single=true&output=csv"

STG_TABLE = "stg_lotes_daily"
ETL_CHUNK = 500

ETL_COLS = [
    "codigo", "zona", "tmh", "humedad_pct", "tms",
    "au_oz_tc", "au_gr_ton", "au_fino",
    "ag_oz_tc", "ag_gr_ton", "ag_fino",
    "cu_pct", "nacn_kg_t", "naoh_kg_t", "rec_pct",
]

ETL_NUM_COLS = [
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


# ✅ CLAVE: convertir Timestamp/datetime a ISO string para JSON/Supabase
def _to_native(x):
    if x is None:
        return None

    # pandas Timestamp
    if isinstance(x, pd.Timestamp):
        if pd.isna(x):
            return None
        # a ISO 8601; si tiene tz la mantiene como +00:00
        return x.to_pydatetime().isoformat()

    # datetime/date
    if isinstance(x, datetime):
        return x.isoformat()
    if isinstance(x, date):
        return x.isoformat()

    # numpy scalars
    if isinstance(x, (np.floating, np.integer)):
        return x.item()

    # NaN floats
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return None

    return x


# -------------------------
# Helpers SOLVER
# -------------------------
def prep_payload(df_out: pd.DataFrame) -> list[dict]:
    if df_out is None or df_out.empty:
        return []
    d = df_out.copy()

    for c in OUTPUT_COLS:
        if c not in d.columns:
            d[c] = None

    d = d[OUTPUT_COLS].replace({np.nan: None})
    payload = d.to_dict(orient="records")
    payload = [{k: _to_native(v) for k, v in row.items()} for row in payload]
    return payload


def prep_payload_rej(df_rej: pd.DataFrame) -> list[dict]:
    """
    Para insertar en stg_lotes_daily_rec
    """
    if df_rej is None or df_rej.empty:
        return []
    d = df_rej.copy()

    for c in REJ_COLS:
        if c not in d.columns:
            d[c] = None

    d = d[REJ_COLS].replace({np.nan: None})
    payload = d.to_dict(orient="records")
    payload = [{k: _to_native(v) for k, v in row.items()} for row in payload]
    return payload


def delete_all(table_name: str):
    # para tablas con id (res_pila_1/2/3)
    supabase.table(table_name).delete().neq("id", -1).execute()


def delete_by_loaded_at(table_name: str):
    # para tablas tipo staging sin id, con loaded_at
    supabase.table(table_name).delete().gte("loaded_at", "1900-01-01T00:00:00Z").execute()


def insert_chunks(table_name: str, payload: list[dict], chunk_size: int = 500) -> int:
    if not payload:
        return 0
    total = 0
    for i in range(0, len(payload), chunk_size):
        chunk = payload[i:i + chunk_size]
        resp = supabase.table(table_name).insert(chunk).execute()
        total += len(resp.data or [])
    return total


# -------------------------
# Helpers ETL
# -------------------------
def json_safe(v):
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except Exception:
        pass

    # ✅ por si llega Timestamp/datetime
    if isinstance(v, pd.Timestamp):
        if pd.isna(v):
            return None
        return v.to_pydatetime().isoformat()
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, date):
        return v.isoformat()

    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v):
            return None
        return float(v)

    if isinstance(v, (np.floating,)):
        if np.isnan(v) or np.isinf(v):
            return None
        return float(v)

    if isinstance(v, (np.integer,)):
        return int(v)

    return v


def parse_num(v):
    """
    Convierte strings con coma decimal y/o separadores de miles a float.
    Ej:
      "12,34" -> 12.34
      "1.234,56" -> 1234.56
      "1,234.56" -> 1234.56
      "" -> NaN
    """
    if v is None:
        return np.nan

    s = str(v).strip()
    if s == "" or s.lower() == "nan":
        return np.nan

    s = s.replace("%", "").replace(" ", "")

    # Caso europeo: 1.234,56
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")

    # Solo coma: 1234,56
    elif "," in s and "." not in s:
        s = s.replace(",", ".")

    return pd.to_numeric(s, errors="coerce")


def run_etl_from_sheets() -> dict:
    # 1) Leer CSV (todo string)
    df = pd.read_csv(SHEETS_CSV_URL, dtype=str)
    df.columns = [str(c).strip() for c in df.columns]

    missing = [c for c in ETL_COLS if c not in df.columns]
    if missing:
        raise ValueError(f"Faltan columnas en Sheets: {missing}")

    df = df[ETL_COLS].copy()

    # 2) Parse numérico robusto
    for c in ETL_NUM_COLS:
        df[c] = df[c].map(parse_num)

    # 3) Limpieza mínima
    df["codigo"] = df["codigo"].astype(str).str.strip()
    df["zona"] = df["zona"].astype(str).str.strip()
    df = df[df["codigo"].notna() & (df["codigo"] != "")].copy()

    # 3.5) ✅ DEDUP
    # A) Borra filas idénticas (todas las columnas iguales)
    df = df.drop_duplicates(subset=ETL_COLS, keep="first").copy()

    # B) Si se repite código con valores distintos, quédate con la primera (arriba)
    df = df.drop_duplicates(subset=["codigo"], keep="first").copy()

    # 4) JSON-safe records
    records = [{k: json_safe(v) for k, v in row.items()} for row in df.to_dict(orient="records")]

    # 5) Borrar staging completo (MVP)
    supabase.table(STG_TABLE).delete().gte("loaded_at", "1900-01-01T00:00:00Z").execute()

    # 6) Insert por chunks
    inserted = 0
    for i in range(0, len(records), ETL_CHUNK):
        batch = records[i:i + ETL_CHUNK]
        resp = supabase.table(STG_TABLE).insert(batch).execute()
        inserted += len(resp.data or [])

    return {"rows_read": int(len(df)), "rows_inserted": int(inserted)}


# =========================
# ENDPOINTS
# =========================
@app.post("/etl")
async def etl(req: Request):
    auth(req)
    try:
        try:
            _ = await req.json()
        except:
            pass

        info = run_etl_from_sheets()
        return {"ok": True, **info}

    except Exception as e:
        # ✅ SIEMPRE JSON
        return {"ok": False, "error": str(e)}


@app.post("/run")
async def run(req: Request):
    auth(req)
    try:
        # 0) leer payload UI (si viene). Si no viene o es inválido, queda {}
        payload = {}
        try:
            payload = await req.json()
            if not isinstance(payload, dict):
                payload = {}
        except:
            payload = {}

        # 1) leer input
        resp = supabase.table(STG_TABLE).select("*").execute()
        rows = resp.data or []
        if not rows:
            return {"ok": False, "error": "stg_lotes_daily vacío"}

        df = pd.DataFrame(rows)

        # 2) correr solver (con payload opcional)
        p1, p2, p3, rej_lowrec = solve(df, payload)

        # 3) preparar payloads (✅ convierte loaded_at a ISO)
        payload_1 = prep_payload(p1)
        payload_2 = prep_payload(p2)
        payload_3 = prep_payload(p3)
        payload_rej = prep_payload_rej(rej_lowrec)

        # 4) delete + insert (pila outputs)
        delete_all("res_pila_1")
        delete_all("res_pila_2")
        delete_all("res_pila_3")

        ins1 = insert_chunks("res_pila_1", payload_1)
        ins2 = insert_chunks("res_pila_2", payload_2)
        ins3 = insert_chunks("res_pila_3", payload_3)

        # 5) delete + insert (rechazos por baja rec)
        delete_by_loaded_at(REJ_TABLE)
        ins_rej = insert_chunks(REJ_TABLE, payload_rej)

        return {
            "ok": True,
            "inserted": {"p1": ins1, "p2": ins2, "p3": ins3, "rej_lowrec": ins_rej},
            "payload_used": payload,  # debug
        }

    except Exception as e:
        # ✅ SIEMPRE JSON (evita "Runner no devolvió JSON")
        return {"ok": False, "error": str(e)}
