# runner/solver.py
import math
from typing import Any, Dict, List, Tuple, Optional

import numpy as np
import pandas as pd

# =========================
# DEFAULTS (tu modelo actual)
# =========================
DEFAULT_PARAMS: Dict[str, Any] = {
    # filtros / restricciones
    "lot_rec_min": 85.0,      # filtro duro por lote
    "pile_rec_min": 85.0,     # rec ponderada de pila >= 85
    "lot_tmh_min": 0.0,       # NUEVO: tmh_eff mínima por lote (0 = no filtra)

    # VARIOS
    "var_tmh_max": 550.0,
    "var_tmh_target": 550.0,
    "var_tmh_min": 440.0,
    "var_g_tries": [(20.0, 24.0), (19.5, 24.0), (19.0, 24.0)],

    # BATCH
    "bat_tmh_max": 120.0,
    "bat_tmh_target": 120.0,
    "bat_tmh_min": 80.0,
    "bat_lot_g_min": 70.0,
    "bat_pile_g_min": 70.0,
    "bat_pile_g_max": 1e9,

    # REAGENTES
    "reag_min": 6.0,
    "reag_max": 8.0,

    # knobs solver batch (si luego quieres exponerlos)
    "batch_n_iters_hard": 900,
    "batch_n_iters_soft": 1400,
    "batch_max_steps": 600,
    "batch_cand_sample": 70,
    "batch_reseeds": 2,
    "batch_pair_topk": 10,
    "batch_pair_pool": 16,

    # semillas
    "seed_batch_base": 100,
    "seed_mix_batch": 888,
}

# =========================
# Helpers parse params
# =========================
def _to_float(x: Any, default: float) -> float:
    try:
        v = float(x)
        if math.isfinite(v):
            return v
        return default
    except:
        return default

def _to_int(x: Any, default: int) -> int:
    try:
        v = int(x)
        return v
    except:
        return default

def _parse_var_g_tries(x: Any, default: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
    if x is None:
        return default
    if isinstance(x, list):
        out: List[Tuple[float, float]] = []
        for item in x:
            if isinstance(item, (list, tuple)) and len(item) == 2:
                a = _to_float(item[0], None)  # type: ignore
                b = _to_float(item[1], None)  # type: ignore
                if a is not None and b is not None and math.isfinite(a) and math.isfinite(b):
                    out.append((float(a), float(b)))
        return out if out else default
    return default

def resolve_params(payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    payload puede venir de UI (req.json()).
    Si no viene o viene incompleto, usamos defaults.
    """
    p = dict(DEFAULT_PARAMS)

    if not payload or not isinstance(payload, dict):
        return p

    # floats
    for k in [
        "lot_rec_min", "pile_rec_min", "lot_tmh_min",
        "var_tmh_max", "var_tmh_target", "var_tmh_min",
        "bat_tmh_max", "bat_tmh_target", "bat_tmh_min",
        "bat_lot_g_min", "bat_pile_g_min", "bat_pile_g_max",
        "reag_min", "reag_max",
    ]:
        if k in payload:
            p[k] = _to_float(payload.get(k), p[k])

    # var_g_tries
    if "var_g_tries" in payload:
        p["var_g_tries"] = _parse_var_g_tries(payload.get("var_g_tries"), p["var_g_tries"])

    # ints
    for k in [
        "batch_n_iters_hard", "batch_n_iters_soft",
        "batch_max_steps", "batch_cand_sample",
        "batch_reseeds", "batch_pair_topk", "batch_pair_pool",
        "seed_batch_base", "seed_mix_batch",
    ]:
        if k in payload:
            p[k] = _to_int(payload.get(k), p[k])

    # saneos mínimos
    if p["reag_min"] > p["reag_max"]:
        p["reag_min"], p["reag_max"] = p["reag_max"], p["reag_min"]

    if p["var_tmh_min"] > p["var_tmh_max"]:
        # si te mandan mal, prioriza max y ajusta min
        p["var_tmh_min"] = p["var_tmh_max"]

    if p["bat_tmh_min"] > p["bat_tmh_max"]:
        p["bat_tmh_min"] = p["bat_tmh_max"]

    return p


# =========================
# 1) PREP DATA (desde df raw)
# =========================
def preprocess(df: pd.DataFrame, params: Dict[str, Any]) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()

    d = df.copy()

    # quedarnos con el último loaded_at (si aplica)
    if "loaded_at" in d.columns and d["loaded_at"].notna().any():
        d["loaded_at"] = pd.to_datetime(d["loaded_at"], utc=True, errors="coerce")
        last_load = d["loaded_at"].max()
        d = d[d["loaded_at"] == last_load].copy()

    num_cols = [
        "tmh","humedad_pct","tms",
        "au_oz_tc","au_gr_ton","au_fino",
        "ag_oz_tc","ag_gr_ton","ag_fino",
        "cu_pct","nacn_kg_t","naoh_kg_t","rec_pct"
    ]
    for c in num_cols:
        if c in d.columns:
            d[c] = pd.to_numeric(d[c], errors="coerce")

    # limpieza mínima base
    d = d.dropna(subset=["codigo", "au_gr_ton", "rec_pct"]).copy()

    # asegurar columnas
    if "tms" not in d.columns: d["tms"] = np.nan
    if "tmh" not in d.columns: d["tmh"] = np.nan
    if "humedad_pct" not in d.columns: d["humedad_pct"] = np.nan

    d["tmh"] = pd.to_numeric(d["tmh"], errors="coerce")
    d["tms"] = pd.to_numeric(d["tms"], errors="coerce")
    d["humedad_pct"] = pd.to_numeric(d["humedad_pct"], errors="coerce")

    # si tms falta, calcúlalo con humedad
    mask_tms_bad = d["tms"].isna() | (d["tms"] <= 0)
    mask_can_calc = d["tmh"].notna() & (d["tmh"] > 0) & d["humedad_pct"].notna()
    d.loc[mask_tms_bad & mask_can_calc, "tms"] = (
        d.loc[mask_tms_bad & mask_can_calc, "tmh"] *
        (1 - d.loc[mask_tms_bad & mask_can_calc, "humedad_pct"] / 100.0)
    )

    # usar tmh como capacidad/objetivo. si falta tmh, fallback a tms
    d["tmh_eff"] = d["tmh"].where(d["tmh"].notna() & (d["tmh"] > 0), d["tms"])
    d = d.dropna(subset=["tmh_eff", "tms"]).copy()
    d = d[(d["tmh_eff"] > 0) & (d["tms"] > 0)].copy()

    # NUEVO: filtro duro por TMH mínima por lote (tmh_eff)
    lot_tmh_min = float(params.get("lot_tmh_min", 0.0) or 0.0)
    if lot_tmh_min > 0:
        d = d[d["tmh_eff"] >= lot_tmh_min].copy()

    # reagentes: si no existen, crear
    if "nacn_kg_t" not in d.columns: d["nacn_kg_t"] = np.nan
    if "naoh_kg_t" not in d.columns: d["naoh_kg_t"] = np.nan

    # finos: si no existen, crear
    if "au_fino" not in d.columns: d["au_fino"] = np.nan
    if "ag_fino" not in d.columns: d["ag_fino"] = np.nan

    # recalcular finos donde falte (fino = ley * tms)
    mask_auf = d["au_fino"].isna()
    d.loc[mask_auf, "au_fino"] = d.loc[mask_auf, "au_gr_ton"] * d.loc[mask_auf, "tms"]

    mask_agf = d["ag_fino"].isna()
    if "ag_gr_ton" in d.columns:
        d.loc[mask_agf, "ag_fino"] = d.loc[mask_agf, "ag_gr_ton"] * d.loc[mask_agf, "tms"]
    else:
        d.loc[mask_agf, "ag_fino"] = np.nan

    # filtro duro por rec de lote
    lot_rec_min = float(params.get("lot_rec_min", 85.0))
    d = d[d["rec_pct"].notna()].copy()
    d = d[d["rec_pct"] >= lot_rec_min].copy()

    return d


# =========================
# 3) HELPERS
# =========================
def wavg(values: pd.Series, weights: pd.Series) -> float:
    w = pd.to_numeric(weights, errors="coerce").fillna(0).astype(float)
    v = pd.to_numeric(values, errors="coerce").fillna(0).astype(float)
    denom = float(w.sum())
    return float((v * w).sum() / denom) if denom > 0 else float("nan")

def metrics(d: pd.DataFrame, pile_rec_min: float) -> dict:
    w = d["tms"].where(d["tms"].notna() & (d["tms"] > 0), d["tmh_eff"])
    return {
        "tmh": float(d["tmh_eff"].sum()),
        "tms": float(d["tms"].sum()),
        "au_gr_ton": wavg(d["au_gr_ton"], w),
        "rec_pct": wavg(d["rec_pct"], w),
        "nacn_kg_t": wavg(d["nacn_kg_t"], w),
        "naoh_kg_t": wavg(d["naoh_kg_t"], w),
        "lowrec_tmh": float(d.loc[d["rec_pct"] < pile_rec_min, "tmh_eff"].sum()),
        "au_fino": float(pd.to_numeric(d["au_fino"], errors="coerce").fillna(0).sum()) if "au_fino" in d.columns else float("nan"),
    }

def grade_ok(avg_g: float, gmin: float, gmax: float, gmin_exclusive: bool, gmax_inclusive: bool) -> bool:
    if math.isnan(avg_g):
        return False
    if gmin_exclusive:
        if not (avg_g > gmin + 1e-9):
            return False
    else:
        if not (avg_g >= gmin - 1e-9):
            return False
    if gmax_inclusive:
        return (avg_g <= gmax + 1e-9)
    return (avg_g < gmax - 1e-9)

def reag_ok(avg_x: float, lo: float, hi: float) -> bool:
    if math.isnan(avg_x):
        return False
    return (avg_x >= lo - 1e-9) and (avg_x <= hi + 1e-9)

def dist_to_band_scalar(x: float, lo: float, hi: float) -> float:
    if math.isnan(x):
        return 1e9
    if x < lo:
        return lo - x
    if x > hi:
        return x - hi
    return 0.0


# =========================
# 4) VARIOS - TRIM
# =========================
def build_varios_trim(
    lots: pd.DataFrame,
    gmin: float,
    gmax: float,
    enforce_reagents: bool,
    rec_min: float,
    tmh_max: float,
    tmh_target: float,
    tmh_min: float,
    reag_min: float,
    reag_max: float,
) -> pd.DataFrame:
    if lots is None or lots.empty:
        return pd.DataFrame()

    d = lots.copy()
    need_cols = ["codigo", "zona", "tmh_eff", "tms", "au_gr_ton", "rec_pct", "au_fino", "nacn_kg_t", "naoh_kg_t"]
    for c in need_cols:
        if c not in d.columns:
            d[c] = np.nan

    d = d.dropna(subset=["codigo", "tmh_eff", "tms", "au_gr_ton", "rec_pct"]).copy()
    d = d[(d["tmh_eff"] > 0) & (d["tms"] > 0)].copy()
    if d.empty:
        return pd.DataFrame()

    if enforce_reagents:
        d = d.dropna(subset=["nacn_kg_t", "naoh_kg_t"]).copy()
        if d.empty:
            return pd.DataFrame()

    d["au_fino"] = pd.to_numeric(d["au_fino"], errors="coerce")
    mask_auf = d["au_fino"].isna()
    d.loc[mask_auf, "au_fino"] = (
        pd.to_numeric(d.loc[mask_auf, "au_gr_ton"], errors="coerce") *
        pd.to_numeric(d.loc[mask_auf, "tms"], errors="coerce")
    )
    d["au_fino"] = d["au_fino"].fillna(0.0)

    tmh = d["tmh_eff"].to_numpy(float)
    tms = d["tms"].to_numpy(float)
    g = d["au_gr_ton"].to_numpy(float)
    r = d["rec_pct"].to_numpy(float)
    cn = pd.to_numeric(d["nacn_kg_t"], errors="coerce").to_numpy(float)
    oh = pd.to_numeric(d["naoh_kg_t"], errors="coerce").to_numpy(float)
    au_fino = d["au_fino"].to_numpy(float)

    gtms = g * tms
    rtms = r * tms
    cntms = cn * tms
    ohtms = oh * tms

    n = len(d)
    keep = np.ones(n, dtype=bool)

    def compute_penalty(tmh_tot, tms_tot, gtms_tot, rtms_tot, cntms_tot, ohtms_tot) -> float:
        if tms_tot <= 0:
            return 1e18

        g_avg = gtms_tot / tms_tot
        r_avg = rtms_tot / tms_tot

        tmh_under = max(0.0, tmh_min - tmh_tot)
        tmh_excess = max(0.0, tmh_tot - tmh_max)

        g_dist = dist_to_band_scalar(g_avg, gmin, gmax)
        r_dist = max(0.0, rec_min - r_avg)

        reag_dist = 0.0
        if enforce_reagents:
            cn_avg = cntms_tot / tms_tot
            oh_avg = ohtms_tot / tms_tot
            reag_dist = dist_to_band_scalar(cn_avg, reag_min, reag_max) + dist_to_band_scalar(oh_avg, reag_min, reag_max)

        return (
            1e12 * tmh_under
            + 1e6  * tmh_excess
            + 5e5  * g_dist
            + 5e5  * r_dist
            + (2e5 * reag_dist if enforce_reagents else 0.0)
            + (10.0 * abs(tmh_tot - tmh_target))
        )

    tmh_tot = float(tmh.sum())
    tms_tot = float(tms.sum())
    gtms_tot = float(gtms.sum())
    rtms_tot = float(rtms.sum())
    cntms_tot = float(cntms.sum())
    ohtms_tot = float(ohtms.sum())

    cur_pen = compute_penalty(tmh_tot, tms_tot, gtms_tot, rtms_tot, cntms_tot, ohtms_tot)

    max_iters = n + 5
    it = 0

    while it < max_iters:
        it += 1

        if tms_tot > 0:
            g_avg = gtms_tot / tms_tot
            r_avg = rtms_tot / tms_tot
            cn_avg = cntms_tot / tms_tot if enforce_reagents else float("nan")
            oh_avg = ohtms_tot / tms_tot if enforce_reagents else float("nan")

            ok = (
                (tmh_tot <= tmh_max + 1e-9)
                and (tmh_tot >= tmh_min - 1e-9)
                and grade_ok(g_avg, gmin, gmax, gmin_exclusive=False, gmax_inclusive=True)
                and (r_avg >= rec_min - 1e-9)
            )
            if enforce_reagents:
                ok = ok and reag_ok(cn_avg, reag_min, reag_max) and reag_ok(oh_avg, reag_min, reag_max)

            if ok:
                break

        idx = np.where(keep)[0]
        if len(idx) == 0:
            return pd.DataFrame()

        new_tmh = tmh_tot - tmh[idx]
        can_remove = new_tmh >= (tmh_min - 1e-9)
        new_tms = tms_tot - tms[idx]
        can_remove = can_remove & (new_tms > 0)

        if not np.any(can_remove):
            return pd.DataFrame()

        idx = idx[can_remove]

        tmh2 = tmh_tot - tmh[idx]
        tms2 = tms_tot - tms[idx]
        gtms2 = gtms_tot - gtms[idx]
        rtms2 = rtms_tot - rtms[idx]
        cntms2 = cntms_tot - cntms[idx]
        ohtms2 = ohtms_tot - ohtms[idx]

        g_avg2 = gtms2 / tms2
        r_avg2 = rtms2 / tms2

        tmh_under2 = np.maximum(0.0, tmh_min - tmh2)
        tmh_excess2 = np.maximum(0.0, tmh2 - tmh_max)

        g_dist2 = np.zeros_like(g_avg2)
        g_dist2[g_avg2 < gmin] = (gmin - g_avg2[g_avg2 < gmin])
        g_dist2[g_avg2 > gmax] = (g_avg2[g_avg2 > gmax] - gmax)

        r_dist2 = np.maximum(0.0, rec_min - r_avg2)

        if enforce_reagents:
            cn_avg2 = cntms2 / tms2
            oh_avg2 = ohtms2 / tms2

            cn_dist2 = np.zeros_like(cn_avg2)
            cn_dist2[cn_avg2 < reag_min] = (reag_min - cn_avg2[cn_avg2 < reag_min])
            cn_dist2[cn_avg2 > reag_max] = (cn_avg2[cn_avg2 > reag_max] - reag_max)

            oh_dist2 = np.zeros_like(oh_avg2)
            oh_dist2[oh_avg2 < reag_min] = (reag_min - oh_avg2[oh_avg2 < reag_min])
            oh_dist2[oh_avg2 > reag_max] = (oh_avg2[oh_avg2 > reag_max] - reag_max)

            reag_dist2 = cn_dist2 + oh_dist2
        else:
            reag_dist2 = 0.0

        pen2 = (
            1e12 * tmh_under2
            + 1e6  * tmh_excess2
            + 5e5  * g_dist2
            + 5e5  * r_dist2
            + (2e5 * reag_dist2 if enforce_reagents else 0.0)
            + (10.0 * np.abs(tmh2 - tmh_target))
        )

        dens = au_fino[idx] / np.maximum(tmh[idx], 1e-9)

        ord_idx = np.lexsort((
            -tmh2,
            dens,
            pen2
        ))
        pick_pos = int(ord_idx[0])
        j = int(idx[pick_pos])

        new_pen = float(pen2[pick_pos])

        need_cut = tmh_tot > tmh_max + 1e-9
        if (not need_cut) and (new_pen >= cur_pen - 1e-6):
            return pd.DataFrame()

        keep[j] = False
        tmh_tot -= float(tmh[j])
        tms_tot -= float(tms[j])
        gtms_tot -= float(gtms[j])
        rtms_tot -= float(rtms[j])
        cntms_tot -= float(cntms[j])
        ohtms_tot -= float(ohtms[j])

        cur_pen = new_pen

    out = d.loc[keep].copy()
    if out.empty:
        return pd.DataFrame()

    out["pile_type"] = "varios"
    return out


# =========================
# 5) BATCH
# =========================
def solve_one_pile(
    lots: pd.DataFrame,
    pile_type: str,
    tmh_max: float,
    tmh_target: float,
    tmh_min: float,
    gmin: float,
    gmax: float,
    gmin_exclusive: bool,
    gmax_inclusive: bool,
    rec_min: float,
    enforce_reagents: bool,
    reag_min: float,
    reag_max: float,
    n_iters: int,
    max_steps: int,
    cand_sample: int,
    reseeds_per_iter: int,
    seed: int,
    pair_topk: int,
    pair_pool: int,
) -> pd.DataFrame:
    if lots is None or lots.empty:
        return pd.DataFrame()

    d = lots.copy()
    d = d.dropna(subset=["codigo", "tmh_eff", "tms", "au_gr_ton", "rec_pct"]).copy()
    d = d[(d["tmh_eff"] > 0) & (d["tms"] > 0)].copy()
    if d.empty:
        return pd.DataFrame()

    if enforce_reagents:
        d = d.dropna(subset=["nacn_kg_t", "naoh_kg_t"]).copy()
        if d.empty:
            return pd.DataFrame()

    d["is_lowrec"] = (d["rec_pct"] < rec_min).astype(int)
    base = d.sort_values(
        by=["is_lowrec", "rec_pct", "tmh_eff"],
        ascending=[True, False, False]
    ).reset_index(drop=True)

    tmh_arr = base["tmh_eff"].to_numpy(float)
    tms_arr = base["tms"].to_numpy(float)
    g_arr   = base["au_gr_ton"].to_numpy(float)
    r_arr   = base["rec_pct"].to_numpy(float)
    cn_arr  = pd.to_numeric(base["nacn_kg_t"], errors="coerce").to_numpy(float)
    oh_arr  = pd.to_numeric(base["naoh_kg_t"], errors="coerce").to_numpy(float)

    gtms  = g_arr  * tms_arr
    rtms  = r_arr  * tms_arr
    cntms = cn_arr * tms_arr
    ohtms = oh_arr * tms_arr

    bad_reag = np.isnan(cn_arr) | np.isnan(oh_arr)

    n = len(base)
    idx_all = np.arange(n)
    rng = np.random.default_rng(seed)

    best_sol = None
    best_key = None

    def grade_pen_vec(new_g: np.ndarray) -> np.ndarray:
        pen = np.zeros_like(new_g, dtype=float)
        nanmask = np.isnan(new_g)
        if nanmask.any():
            pen[nanmask] = 1e6

        if gmin_exclusive:
            m = (~nanmask) & (new_g <= gmin + 1e-9)
            pen[m] = (gmin - new_g[m]) + 1e-6
        else:
            m = (~nanmask) & (new_g < gmin - 1e-9)
            pen[m] = (gmin - new_g[m])

        if gmax_inclusive:
            m = (~nanmask) & (new_g > gmax + 1e-9)
            pen[m] = np.maximum(pen[m], (new_g[m] - gmax))
        else:
            m = (~nanmask) & (new_g >= gmax - 1e-9)
            pen[m] = np.maximum(pen[m], (new_g[m] - gmax) + 1e-6)

        return pen

    def dist_to_band_vec(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
        out = np.zeros_like(x, dtype=float)
        nanmask = np.isnan(x)
        if nanmask.any():
            out[nanmask] = 1e9
        lo_mask = (~nanmask) & (x < lo)
        hi_mask = (~nanmask) & (x > hi)
        out[lo_mask] = (lo - x[lo_mask])
        out[hi_mask] = (x[hi_mask] - hi)
        return out

    for _ in range(n_iters):
        used = np.zeros(n, dtype=bool)
        picked: list[int] = []

        cur_tmh = 0.0
        cur_tms = 0.0
        cur_gtms = 0.0
        cur_rtms = 0.0
        cur_cntms = 0.0
        cur_ohtms = 0.0

        order = rng.permutation(idx_all)
        ptr = 0
        reseeds_left = reseeds_per_iter

        for _step in range(max_steps):
            if cur_tmh >= tmh_max - 1e-9:
                break

            cap = tmh_max - cur_tmh
            need = max(0.0, min(tmh_target, tmh_max) - cur_tmh)

            cand = []
            while ptr < n and len(cand) < cand_sample:
                j = int(order[ptr]); ptr += 1
                if used[j]:
                    continue
                if tmh_arr[j] <= 0 or tmh_arr[j] > cap + 1e-9:
                    continue
                cand.append(j)

            if not cand:
                if reseeds_left > 0:
                    order = rng.permutation(idx_all)
                    ptr = 0
                    reseeds_left -= 1
                    continue
                break

            cand_np = np.array(cand, dtype=int)

            add_tmh = tmh_arr[cand_np]
            add_tms = tms_arr[cand_np]
            new_tms = cur_tms + add_tms

            inv = (add_tmh <= 0) | (add_tms <= 0) | (new_tms <= 0)

            new_g  = (cur_gtms + gtms[cand_np]) / new_tms
            new_r  = (cur_rtms + rtms[cand_np]) / new_tms
            new_cn = (cur_cntms + cntms[cand_np]) / new_tms
            new_oh = (cur_ohtms + ohtms[cand_np]) / new_tms

            fill = np.minimum(add_tmh, need)

            g_pen = grade_pen_vec(new_g)
            rec_pen = np.maximum(0.0, rec_min - new_r)

            cn_dist = dist_to_band_vec(new_cn, reag_min, reag_max)
            oh_dist = dist_to_band_vec(new_oh, reag_min, reag_max)

            lowrec_pen = (r_arr[cand_np] < rec_min).astype(float)

            if enforce_reagents:
                reag_pen = 120.0 * (cn_dist + oh_dist)
            else:
                reag_pen = 18.0 * (cn_dist + oh_dist)

            score = (
                18.0 * fill
                - 250.0 * g_pen
                - 90.0  * rec_pen
                - 25.0  * lowrec_pen
                - reag_pen
                + 0.15 * add_tmh
            )

            bad = bad_reag[cand_np]
            score[bad] = -1e15
            score[inv] = -1e18

            best_idx = int(np.argmax(score))
            best_choice = (int(cand_np[best_idx]),)
            best_score = float(score[best_idx])

            k = min(pair_topk, len(cand_np))
            pool = min(pair_pool, len(cand_np))

            if k >= 2 and pool >= 2:
                topk_idx = np.argpartition(score, -k)[-k:]
                topk_cands = cand_np[topk_idx]
                partner_pool = cand_np[:pool]

                for j in topk_cands:
                    for kk in partner_pool:
                        if kk == j:
                            continue
                        if tmh_arr[j] + tmh_arr[kk] > cap + 1e-9:
                            continue

                        if bad_reag[j] or bad_reag[kk]:
                            sc = -1e15
                        else:
                            add_tmh2 = tmh_arr[j] + tmh_arr[kk]
                            add_tms2 = tms_arr[j] + tms_arr[kk]
                            if add_tmh2 <= 0 or add_tms2 <= 0:
                                sc = -1e18
                            else:
                                new_tms2 = cur_tms + add_tms2
                                new_g2  = (cur_gtms + gtms[j] + gtms[kk]) / new_tms2
                                new_r2  = (cur_rtms + rtms[j] + rtms[kk]) / new_tms2
                                new_cn2 = (cur_cntms + cntms[j] + cntms[kk]) / new_tms2
                                new_oh2 = (cur_ohtms + ohtms[j] + ohtms[kk]) / new_tms2

                                fill2 = min(add_tmh2, need)

                                g_pen2 = 0.0
                                if math.isnan(new_g2):
                                    g_pen2 = 1e6
                                else:
                                    if new_g2 < gmin - 1e-9:
                                        g_pen2 = (gmin - new_g2)
                                    if new_g2 > gmax + 1e-9:
                                        g_pen2 = max(g_pen2, (new_g2 - gmax))

                                rec_pen2 = max(0.0, rec_min - new_r2)

                                cn_dist2 = dist_to_band_scalar(new_cn2, reag_min, reag_max)
                                oh_dist2 = dist_to_band_scalar(new_oh2, reag_min, reag_max)
                                lowrec2 = (1.0 if r_arr[j] < rec_min else 0.0) + (1.0 if r_arr[kk] < rec_min else 0.0)

                                if enforce_reagents:
                                    reag_pen2 = 120.0 * (cn_dist2 + oh_dist2)
                                else:
                                    reag_pen2 = 18.0 * (cn_dist2 + oh_dist2)

                                sc = (
                                    18.0 * fill2
                                    - 250.0 * g_pen2
                                    - 90.0  * rec_pen2
                                    - 25.0  * lowrec2
                                    - reag_pen2
                                    + 0.15 * add_tmh2
                                )

                        if sc > best_score:
                            best_score = sc
                            best_choice = (int(j), int(kk))

            for j in best_choice:
                used[j] = True
                picked.append(j)
                cur_tmh += tmh_arr[j]
                cur_tms += tms_arr[j]
                cur_gtms += gtms[j]
                cur_rtms += rtms[j]
                cur_cntms += cntms[j]
                cur_ohtms += ohtms[j]

            if cur_tmh >= min(tmh_target, tmh_max) - 1e-9:
                break

        if not picked:
            continue

        sol = base.iloc[picked].drop(columns=["is_lowrec"], errors="ignore").copy()
        m = metrics(sol, pile_rec_min=rec_min)

        if m["tmh"] <= 0 or m["tmh"] > tmh_max + 1e-9:
            continue
        if m["rec_pct"] < rec_min - 1e-9:
            continue
        if not grade_ok(m["au_gr_ton"], gmin, gmax, gmin_exclusive, gmax_inclusive):
            continue
        if enforce_reagents:
            if (not reag_ok(m["nacn_kg_t"], reag_min, reag_max)) or (not reag_ok(m["naoh_kg_t"], reag_min, reag_max)):
                continue

        under = max(0.0, tmh_min - m["tmh"])
        gap = abs(m["tmh"] - tmh_target)
        key = (under, gap, -m["tmh"], -m["rec_pct"])
        if best_key is None or key < best_key:
            best_key = key
            best_sol = sol

    if best_sol is None:
        return pd.DataFrame()

    best_sol = best_sol.copy()
    best_sol["pile_type"] = pile_type
    return best_sol


def build_batch(lots: pd.DataFrame, params: Dict[str, Any], seed: int) -> pd.DataFrame:
    bat_lot_g_min = float(params["bat_lot_g_min"])
    pile_rec_min = float(params["pile_rec_min"])

    eligible = lots.copy()
    eligible = eligible.dropna(subset=["au_gr_ton"]).copy()
    eligible = eligible[eligible["au_gr_ton"] >= bat_lot_g_min].copy()
    if eligible.empty:
        return pd.DataFrame()

    # HARD reagentes
    p = solve_one_pile(
        lots=eligible,
        pile_type="batch",
        tmh_max=float(params["bat_tmh_max"]),
        tmh_target=float(params["bat_tmh_target"]),
        tmh_min=float(params["bat_tmh_min"]),
        gmin=float(params["bat_pile_g_min"]),
        gmax=float(params["bat_pile_g_max"]),
        gmin_exclusive=False,
        gmax_inclusive=True,
        rec_min=pile_rec_min,
        enforce_reagents=True,
        reag_min=float(params["reag_min"]),
        reag_max=float(params["reag_max"]),
        n_iters=int(params["batch_n_iters_hard"]),
        max_steps=int(params["batch_max_steps"]),
        cand_sample=int(params["batch_cand_sample"]),
        reseeds_per_iter=int(params["batch_reseeds"]),
        seed=seed,
        pair_topk=int(params["batch_pair_topk"]),
        pair_pool=int(params["batch_pair_pool"]),
    )
    if not p.empty and metrics(p, pile_rec_min=pile_rec_min)["tmh"] >= float(params["bat_tmh_min"]) - 1e-9:
        return p

    # SOFT reagentes
    p = solve_one_pile(
        lots=eligible,
        pile_type="batch",
        tmh_max=float(params["bat_tmh_max"]),
        tmh_target=float(params["bat_tmh_target"]),
        tmh_min=float(params["bat_tmh_min"]),
        gmin=float(params["bat_pile_g_min"]),
        gmax=float(params["bat_pile_g_max"]),
        gmin_exclusive=False,
        gmax_inclusive=True,
        rec_min=pile_rec_min,
        enforce_reagents=False,
        reag_min=float(params["reag_min"]),
        reag_max=float(params["reag_max"]),
        n_iters=int(params["batch_n_iters_soft"]),
        max_steps=int(params["batch_max_steps"]),
        cand_sample=int(params["batch_cand_sample"]),
        reseeds_per_iter=int(params["batch_reseeds"]),
        seed=seed + 1000,
        pair_topk=int(params["batch_pair_topk"]),
        pair_pool=int(params["batch_pair_pool"]),
    )
    if not p.empty and metrics(p, pile_rec_min=pile_rec_min)["tmh"] >= float(params["bat_tmh_min"]) - 1e-9:
        return p

    return pd.DataFrame()


# =========================
# 6) ORQUESTACIÓN
# =========================
def build_varios(lots: pd.DataFrame, params: Dict[str, Any]) -> pd.DataFrame:
    pile_rec_min = float(params["pile_rec_min"])
    var_tmh_min = float(params["var_tmh_min"])
    var_tmh_max = float(params["var_tmh_max"])

    var_g_tries: List[Tuple[float, float]] = list(params["var_g_tries"])
    for (gmin, gmax) in var_g_tries:
        p = build_varios_trim(
            lots=lots,
            gmin=float(gmin),
            gmax=float(gmax),
            enforce_reagents=True,
            rec_min=pile_rec_min,
            tmh_max=float(params["var_tmh_max"]),
            tmh_target=float(params["var_tmh_target"]),
            tmh_min=float(params["var_tmh_min"]),
            reag_min=float(params["reag_min"]),
            reag_max=float(params["reag_max"]),
        )
        if not p.empty:
            m = metrics(p, pile_rec_min=pile_rec_min)
            if m["tmh"] >= var_tmh_min - 1e-9 and m["tmh"] <= var_tmh_max + 1e-9:
                return p

    for (gmin, gmax) in var_g_tries:
        p = build_varios_trim(
            lots=lots,
            gmin=float(gmin),
            gmax=float(gmax),
            enforce_reagents=False,
            rec_min=pile_rec_min,
            tmh_max=float(params["var_tmh_max"]),
            tmh_target=float(params["var_tmh_target"]),
            tmh_min=float(params["var_tmh_min"]),
            reag_min=float(params["reag_min"]),
            reag_max=float(params["reag_max"]),
        )
        if not p.empty:
            m = metrics(p, pile_rec_min=pile_rec_min)
            if m["tmh"] >= var_tmh_min - 1e-9 and m["tmh"] <= var_tmh_max + 1e-9:
                return p

    return pd.DataFrame()


def solve(df_raw: pd.DataFrame, payload: Optional[Dict[str, Any]] = None) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Input: df con columnas de stg_lotes_daily.
    payload: overrides desde UI (opcional).
    Output: p1, p2, p3 listos para insertar.
    """
    params = resolve_params(payload)

    df = preprocess(df_raw, params)
    if df.empty:
        return pd.DataFrame(), pd.DataFrame(), pd.DataFrame()

    # OUTPUT 1: 1 pila varios
    p1 = build_varios(df, params).copy()
    if not p1.empty:
        p1["pile_code"] = 1

    # OUTPUT 2: batches 1..N (sin repetir)
    remaining = df.copy()
    batch_piles = []
    pile_idx = 1

    seed_batch_base = int(params["seed_batch_base"])

    while True:
        p = build_batch(remaining, params, seed=seed_batch_base + pile_idx)
        if p.empty:
            break
        p = p.copy()
        p["pile_code"] = pile_idx
        batch_piles.append(p)

        used_codes = set(p["codigo"].astype(str).tolist())
        remaining = remaining[~remaining["codigo"].astype(str).isin(used_codes)].copy()
        pile_idx += 1

    p2 = pd.concat(batch_piles, ignore_index=True) if batch_piles else pd.DataFrame()

    # OUTPUT 3: mixto = 1 varios + 1 batch (sin repetir)
    rem_mix = df.copy()

    mix_varios = build_varios(rem_mix, params).copy()
    if not mix_varios.empty:
        mix_varios["pile_code"] = 1
        used_codes = set(mix_varios["codigo"].astype(str).tolist())
        rem_mix = rem_mix[~rem_mix["codigo"].astype(str).isin(used_codes)].copy()

    mix_batch = build_batch(rem_mix, params, seed=int(params["seed_mix_batch"])).copy()
    if not mix_batch.empty:
        mix_batch["pile_code"] = 2

    p3 = pd.concat([mix_varios, mix_batch], ignore_index=True)

    return p1, p2, p3
