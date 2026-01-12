import os
from fastapi import FastAPI, HTTPException, Request

app = FastAPI()
RUNNER_SECRET = os.getenv("RUNNER_SECRET", "")

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/run")
async def run(req: Request):
    if RUNNER_SECRET:
        got = req.headers.get("x-runner-secret", "")
        if got != RUNNER_SECRET:
            raise HTTPException(status_code=401, detail="unauthorized")

    # luego acá conectamos tu solver real
    return {"status": "stub", "message": "Runner OK"}
