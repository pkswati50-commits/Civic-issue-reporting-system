"""
Seed script — generates realistic demo data for CivicFix.
Run this AFTER starting the server once (so civic.db exists), or run it
standalone first: `python seed.py` creates the DB directly.

Produces:
 - Multiple issues spread across a city
 - Some clustered "duplicate" reports (same spot, same category) to show
   the upvote/verification feature clearly
 - A mix of statuses including a couple of resolved + reopened issues
   so the full lifecycle is visible in the demo
"""

import sqlite3
import uuid
import random
from datetime import datetime, timedelta
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "civic.db")

CATEGORY_CONFIG = {
    "pothole":            "Roads & Infrastructure Dept",
    "damaged_road":       "Roads & Infrastructure Dept",
    "garbage":            "Sanitation Dept",
    "illegal_dumping":    "Sanitation Dept",
    "streetlight":        "Electrical Dept",
    "water_leakage":      "Water Works Dept",
    "drainage_blockage":  "Drainage & Sewage Dept",
    "open_manhole":       "Roads & Infrastructure Dept",
}

# Rough Bengaluru-area coordinate box — change this to your demo city if needed
LAT_RANGE = (12.90, 13.05)
LNG_RANGE = (77.55, 77.68)

DESCRIPTIONS = {
    "pothole": ["Large pothole causing traffic slowdown", "Deep pothole, damaged my bike tire", "Growing pothole near the junction"],
    "damaged_road": ["Road surface completely broken", "Cracked road, needs resurfacing"],
    "garbage": ["Garbage bin overflowing for days", "Trash not collected this week", "Waste piling up on the roadside"],
    "illegal_dumping": ["Construction debris dumped illegally", "Someone dumping waste at night"],
    "streetlight": ["Streetlight not working for a week", "Flickering streetlight, area is dark at night"],
    "water_leakage": ["Pipe burst, water flooding street", "Constant water leakage from main line"],
    "drainage_blockage": ["Drain blocked, water logging during rain", "Sewage overflow due to blocked drain"],
    "open_manhole": ["Open manhole, dangerous for pedestrians", "Missing manhole cover"],
}


def rand_point():
    return round(random.uniform(*LAT_RANGE), 5), round(random.uniform(*LNG_RANGE), 5)


def jitter(lat, lng, meters=25):
    # small offset to simulate multiple citizens reporting near-same spot
    deg = meters / 111000
    return round(lat + random.uniform(-deg, deg), 5), round(lng + random.uniform(-deg, deg), 5)


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS issues (
            id TEXT PRIMARY KEY, category TEXT NOT NULL, description TEXT,
            photo_path TEXT, lat REAL NOT NULL, lng REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'reported', department TEXT,
            upvotes INTEGER NOT NULL DEFAULT 1, reopened_count INTEGER NOT NULL DEFAULT 0,
            reporter_id TEXT, created_at TEXT NOT NULL, resolved_at TEXT,
            resolution_photo_path TEXT
        )
    """)
    cur.execute("CREATE TABLE IF NOT EXISTS reporters (issue_id TEXT, reporter_id TEXT, reported_at TEXT)")
    conn.commit()

    now = datetime.utcnow()
    created_count = 0

    # 1. Clustered "hotspot" issues (show duplicate-detection value clearly)
    hotspot_specs = [
        ("pothole", 8), ("garbage", 6), ("drainage_blockage", 5), ("streetlight", 4),
    ]
    for category, upvotes in hotspot_specs:
        base_lat, base_lng = rand_point()
        created_at = now - timedelta(days=random.randint(2, 10))
        cur.execute(
            """INSERT INTO issues (id, category, description, photo_path, lat, lng, status,
               department, upvotes, reopened_count, reporter_id, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (uuid.uuid4().hex, category, random.choice(DESCRIPTIONS[category]), None,
             base_lat, base_lng, "reported", CATEGORY_CONFIG[category], upvotes, 0,
             "citizen_seed", created_at.isoformat())
        )
        created_count += 1

    # 2. Scattered single issues across various categories/statuses
    for _ in range(20):
        category = random.choice(list(CATEGORY_CONFIG.keys()))
        lat, lng = rand_point()
        status = random.choices(
            ["reported", "acknowledged", "in_progress", "resolved"],
            weights=[35, 20, 20, 25]
        )[0]
        created_at = now - timedelta(days=random.randint(0, 14), hours=random.randint(0, 23))
        resolved_at = None
        reopened = 0
        if status == "resolved":
            resolved_at = (created_at + timedelta(hours=random.randint(4, 96))).isoformat()
            if random.random() < 0.15:
                reopened = 1  # simulate a "not actually fixed" case

        cur.execute(
            """INSERT INTO issues (id, category, description, photo_path, lat, lng, status,
               department, upvotes, reopened_count, reporter_id, created_at, resolved_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (uuid.uuid4().hex, category, random.choice(DESCRIPTIONS[category]), None,
             lat, lng, status, CATEGORY_CONFIG[category], random.randint(1, 4), reopened,
             f"citizen_{random.randint(1,50)}", created_at.isoformat(), resolved_at)
        )
        created_count += 1

    conn.commit()
    conn.close()
    print(f"Seeded {created_count} demo issues into {DB_PATH}")


if __name__ == "__main__":
    main()
