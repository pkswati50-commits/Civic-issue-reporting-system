"""
Crowdsourced Civic Issue Reporting & Resolution System
Backend: FastAPI + SQLite

Lifecycle implemented: Report -> Verify -> Prioritize -> Assign -> Work -> Resolve -> Verify -> Learn
"""

import sqlite3
import math
import base64
import os
import uuid
import json
import urllib.request
import urllib.error
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB_PATH = os.path.join(os.path.dirname(__file__), "civic.db")
PHOTOS_DIR = os.path.join(os.path.dirname(__file__), "static", "photos")
os.makedirs(PHOTOS_DIR, exist_ok=True)

app = FastAPI(title="Civic Issue Reporting & Resolution System")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Category config: severity weight (for prioritization) + assigned department
# ---------------------------------------------------------------------------
CATEGORY_CONFIG = {
    "pothole":            {"weight": 4, "department": "Roads & Infrastructure Dept"},
    "damaged_road":       {"weight": 4, "department": "Roads & Infrastructure Dept"},
    "garbage":            {"weight": 3, "department": "Sanitation Dept"},
    "illegal_dumping":    {"weight": 3, "department": "Sanitation Dept"},
    "streetlight":        {"weight": 3, "department": "Electrical Dept"},
    "water_leakage":      {"weight": 4, "department": "Water Works Dept"},
    "drainage_blockage":  {"weight": 5, "department": "Drainage & Sewage Dept"},
    "open_manhole":       {"weight": 5, "department": "Roads & Infrastructure Dept"},
    "other":              {"weight": 2, "department": "General Municipal Office"},
}

DUPLICATE_RADIUS_METERS = 60  # reports of same category within this radius are merged

STATUS_FLOW = ["reported", "acknowledged", "in_progress", "resolved"]


# ---------------------------------------------------------------------------
# DB setup
# ---------------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS issues (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            description TEXT,
            photo_path TEXT,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'reported',
            department TEXT,
            upvotes INTEGER NOT NULL DEFAULT 1,
            reopened_count INTEGER NOT NULL DEFAULT 0,
            reporter_id TEXT,
            created_at TEXT NOT NULL,
            resolved_at TEXT,
            resolution_photo_path TEXT
        )
    """)
    # each individual citizen confirmation of "still an issue" or original report
    conn.execute("""
        CREATE TABLE IF NOT EXISTS reporters (
            issue_id TEXT,
            reporter_id TEXT,
            reported_at TEXT
        )
    """)
    conn.commit()
    conn.close()


init_db()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def haversine_meters(lat1, lng1, lat2, lng2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def priority_score(row):
    weight = CATEGORY_CONFIG.get(row["category"], CATEGORY_CONFIG["other"])["weight"]
    # more upvotes + higher severity weight = higher priority
    return row["upvotes"] * weight


def issue_to_dict(row):
    d = dict(row)
    d["priority_score"] = priority_score(row)
    d["photo_url"] = f"/static/photos/{row['photo_path']}" if row["photo_path"] else None
    d["resolution_photo_url"] = f"/static/photos/{row['resolution_photo_path']}" if row["resolution_photo_path"] else None
    return d


def save_base64_photo(photo_base64: str) -> str:
    """Decode a base64 photo string and save it, return filename."""
    if not photo_base64:
        return None
    filename = f"{uuid.uuid4().hex}.jpg"
    path = os.path.join(PHOTOS_DIR, filename)
    try:
        # strip data URL prefix if present
        if "," in photo_base64:
            photo_base64 = photo_base64.split(",", 1)[1]
        with open(path, "wb") as f:
            f.write(base64.b64decode(photo_base64))
        return filename
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class ReportIn(BaseModel):
    category: str
    description: str
    lat: float
    lng: float
    photo_base64: Optional[str] = None
    reporter_id: Optional[str] = "anonymous"


class StatusUpdate(BaseModel):
    status: str


class ResolveIn(BaseModel):
    resolution_photo_base64: Optional[str] = None


# ---------------------------------------------------------------------------
# AI-assisted categorization: analyze uploaded photo, suggest category + severity
# Uses Claude Vision via the Anthropic API. Requires ANTHROPIC_API_KEY env var.
# Set it before starting the server:
#   export ANTHROPIC_API_KEY="your-key-here"      (Mac/Linux)
#   $env:ANTHROPIC_API_KEY="your-key-here"         (Windows PowerShell)
# If no key is set, the endpoint returns a graceful fallback so the app
# still works end-to-end without AI (manual category selection).
# ---------------------------------------------------------------------------
VALID_CATEGORIES = list(CATEGORY_CONFIG.keys())


class PhotoAnalyzeIn(BaseModel):
    photo_base64: str


@app.post("/api/analyze-photo")
def analyze_photo(payload: PhotoAnalyzeIn):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return {
            "ai_available": False,
            "message": "AI categorization not configured (no ANTHROPIC_API_KEY set). Please select a category manually.",
        }

    photo_data = payload.photo_base64
    media_type = "image/jpeg"
    if "," in photo_data:
        header, photo_data = photo_data.split(",", 1)
        if "png" in header:
            media_type = "image/png"

    prompt = (
        "You are looking at a photo of a civic infrastructure issue reported by a citizen. "
        f"Classify it into EXACTLY ONE of these categories: {', '.join(VALID_CATEGORIES)}. "
        "Also rate its severity from 1 (minor) to 5 (dangerous/urgent), and write a one-sentence "
        "description of what you see. "
        "Respond ONLY with valid JSON, no markdown, no preamble, in exactly this shape: "
        '{"category": "<one of the categories above>", "severity": <1-5 integer>, "description": "<one sentence>"}'
    )

    body = json.dumps({
        "model": "claude-sonnet-4-6",
        "max_tokens": 300,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": photo_data}},
                {"type": "text", "text": prompt},
            ],
        }],
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        text = "".join(
            block.get("text", "") for block in result.get("content", []) if block.get("type") == "text"
        ).strip()
        # strip accidental markdown fences if the model adds them
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:]
        parsed = json.loads(text)
        if parsed.get("category") not in VALID_CATEGORIES:
            parsed["category"] = "other"
        return {"ai_available": True, **parsed}
    except urllib.error.HTTPError as e:
        return {"ai_available": False, "message": f"AI service error ({e.code}). Please select a category manually."}
    except Exception:
        return {"ai_available": False, "message": "Could not analyze photo. Please select a category manually."}


# ---------------------------------------------------------------------------
# STAGE 1 & 2: Report + Verify (auto-verify via duplicate clustering)
# ---------------------------------------------------------------------------
@app.post("/api/report")
def report_issue(payload: ReportIn):
    if payload.category not in CATEGORY_CONFIG:
        raise HTTPException(400, f"Unknown category '{payload.category}'")

    conn = get_db()
    cur = conn.cursor()

    # Look for an existing OPEN issue of the same category nearby -> treat as duplicate/confirmation
    cur.execute(
        "SELECT * FROM issues WHERE category = ? AND status != 'resolved'",
        (payload.category,),
    )
    candidates = cur.fetchall()

    for row in candidates:
        dist = haversine_meters(payload.lat, payload.lng, row["lat"], row["lng"])
        if dist <= DUPLICATE_RADIUS_METERS:
            # duplicate found -> merge as an upvote/confirmation instead of new issue
            cur.execute(
                "UPDATE issues SET upvotes = upvotes + 1 WHERE id = ?", (row["id"],)
            )
            cur.execute(
                "INSERT INTO reporters (issue_id, reporter_id, reported_at) VALUES (?, ?, ?)",
                (row["id"], payload.reporter_id, datetime.utcnow().isoformat()),
            )
            conn.commit()
            cur.execute("SELECT * FROM issues WHERE id = ?", (row["id"],))
            updated = cur.fetchone()
            conn.close()
            return {
                "merged_into_existing": True,
                "issue": issue_to_dict(updated),
                "message": "This matches an existing nearby report. Added your confirmation.",
            }

    # No duplicate -> create new issue
    issue_id = uuid.uuid4().hex
    photo_filename = save_base64_photo(payload.photo_base64)
    department = CATEGORY_CONFIG[payload.category]["department"]
    now = datetime.utcnow().isoformat()

    cur.execute(
        """INSERT INTO issues
           (id, category, description, photo_path, lat, lng, status, department,
            upvotes, reopened_count, reporter_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'reported', ?, 1, 0, ?, ?)""",
        (issue_id, payload.category, payload.description, photo_filename,
         payload.lat, payload.lng, department, payload.reporter_id, now),
    )
    cur.execute(
        "INSERT INTO reporters (issue_id, reporter_id, reported_at) VALUES (?, ?, ?)",
        (issue_id, payload.reporter_id, now),
    )
    conn.commit()
    cur.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
    new_row = cur.fetchone()
    conn.close()

    return {
        "merged_into_existing": False,
        "issue": issue_to_dict(new_row),
        "message": "New issue reported and auto-assigned.",
    }


# ---------------------------------------------------------------------------
# STAGE 3: Prioritize -- issue list sorted by priority score
# ---------------------------------------------------------------------------
@app.get("/api/issues")
def list_issues(status: Optional[str] = None, category: Optional[str] = None):
    conn = get_db()
    cur = conn.cursor()
    query = "SELECT * FROM issues WHERE 1=1"
    params = []
    if status:
        query += " AND status = ?"
        params.append(status)
    if category:
        query += " AND category = ?"
        params.append(category)
    cur.execute(query, params)
    rows = [issue_to_dict(r) for r in cur.fetchall()]
    conn.close()
    rows.sort(key=lambda r: r["priority_score"], reverse=True)
    return rows


@app.get("/api/issues/{issue_id}")
def get_issue(issue_id: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Issue not found")
    return issue_to_dict(row)


# ---------------------------------------------------------------------------
# STAGE 4 & 5: Assign (auto, done at creation) + Work (status progression)
# ---------------------------------------------------------------------------
@app.patch("/api/issues/{issue_id}/status")
def update_status(issue_id: str, payload: StatusUpdate):
    if payload.status not in STATUS_FLOW:
        raise HTTPException(400, f"status must be one of {STATUS_FLOW}")
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Issue not found")

    if payload.status == "resolved":
        cur.execute(
            "UPDATE issues SET status = ?, resolved_at = ? WHERE id = ?",
            (payload.status, datetime.utcnow().isoformat(), issue_id),
        )
    else:
        cur.execute("UPDATE issues SET status = ? WHERE id = ?", (payload.status, issue_id))
    conn.commit()
    cur.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
    updated = cur.fetchone()
    conn.close()
    return issue_to_dict(updated)


# ---------------------------------------------------------------------------
# STAGE 6: Resolve (authority marks resolved w/ optional proof photo)
# ---------------------------------------------------------------------------
@app.post("/api/issues/{issue_id}/resolve")
def resolve_issue(issue_id: str, payload: ResolveIn):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Issue not found")

    photo_filename = save_base64_photo(payload.resolution_photo_base64) if payload.resolution_photo_base64 else None
    cur.execute(
        "UPDATE issues SET status = 'resolved', resolved_at = ?, resolution_photo_path = ? WHERE id = ?",
        (datetime.utcnow().isoformat(), photo_filename, issue_id),
    )
    conn.commit()
    cur.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
    updated = cur.fetchone()
    conn.close()
    return issue_to_dict(updated)


# ---------------------------------------------------------------------------
# STAGE 7: Citizen-side Verify -- confirm fixed, or reopen if not actually fixed
# ---------------------------------------------------------------------------
@app.post("/api/issues/{issue_id}/confirm-fixed")
def confirm_fixed(issue_id: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Issue not found")
    if row["status"] != "resolved":
        conn.close()
        raise HTTPException(400, "Issue is not marked resolved yet")
    conn.close()
    return {"message": "Thanks for confirming! Issue closed and verified by citizen."}


@app.post("/api/issues/{issue_id}/reopen")
def reopen_issue(issue_id: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Issue not found")
    if row["status"] != "resolved":
        conn.close()
        raise HTTPException(400, "Issue is not marked resolved, cannot reopen")

    cur.execute(
        "UPDATE issues SET status = 'reported', reopened_count = reopened_count + 1, resolved_at = NULL WHERE id = ?",
        (issue_id,),
    )
    conn.commit()
    cur.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
    updated = cur.fetchone()
    conn.close()
    return issue_to_dict(updated)


# ---------------------------------------------------------------------------
# STAGE 8: Learn -- analytics
# ---------------------------------------------------------------------------
@app.get("/api/analytics")
def analytics():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT category, COUNT(*) as count FROM issues GROUP BY category")
    by_category = {r["category"]: r["count"] for r in cur.fetchall()}

    cur.execute("SELECT status, COUNT(*) as count FROM issues GROUP BY status")
    by_status = {r["status"]: r["count"] for r in cur.fetchall()}

    cur.execute("SELECT department, COUNT(*) as count FROM issues GROUP BY department")
    by_department = {r["department"]: r["count"] for r in cur.fetchall()}

    # average resolution time (hours) for resolved issues
    cur.execute("SELECT created_at, resolved_at FROM issues WHERE resolved_at IS NOT NULL")
    durations = []
    for r in cur.fetchall():
        created = datetime.fromisoformat(r["created_at"])
        resolved = datetime.fromisoformat(r["resolved_at"])
        durations.append((resolved - created).total_seconds() / 3600)
    avg_resolution_hours = round(sum(durations) / len(durations), 1) if durations else None

    cur.execute("SELECT COUNT(*) as c FROM issues WHERE reopened_count > 0")
    reopened_issues_count = cur.fetchone()["c"]

    cur.execute("SELECT COUNT(*) as c FROM issues")
    total_issues = cur.fetchone()["c"]

    cur.execute(
        "SELECT lat, lng, category, COUNT(*) as c FROM issues GROUP BY ROUND(lat,3), ROUND(lng,3) HAVING c > 1 ORDER BY c DESC LIMIT 5"
    )
    hotspots = [dict(r) for r in cur.fetchall()]

    conn.close()

    return {
        "total_issues": total_issues,
        "by_category": by_category,
        "by_status": by_status,
        "by_department": by_department,
        "avg_resolution_hours": avg_resolution_hours,
        "reopened_issues_count": reopened_issues_count,
        "recurring_hotspots": hotspots,
    }


# ---------------------------------------------------------------------------
# Static files + frontend
# ---------------------------------------------------------------------------
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static")), name="static")


@app.get("/")
def citizen_page():
    return FileResponse(os.path.join(os.path.dirname(__file__), "static", "index.html"))


@app.get("/admin")
def admin_page():
    return FileResponse(os.path.join(os.path.dirname(__file__), "static", "admin.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
