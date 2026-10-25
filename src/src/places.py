"""
places.py: a caching proxy for OpenStreetMap place lookups (Overpass API).

Why this exists: the public Overpass servers give each IP only 2 query slots and
ask apps not to use them as a live backend. So the browser never talks to Overpass.
It asks this server, which:

  * splits the requested view into fixed map tiles (zoom 16, roughly 500 m wide),
  * answers from a SQLite cache for every tile it has already seen,
  * fetches only the missing tiles, in ONE small Overpass query,
  * sends one Overpass query at a time, with fail-over to other servers,
  * shares an in-flight fetch between requests for the same area.

Wire it up in main.py:
    from places import router as places_router
    app.include_router(places_router)
"""
import asyncio
import json
import math
import sqlite3
import time
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

# ---- settings ---------------------------------------------------------------
ZOOM = 16                      # tile size; if you change this, delete the cache file
MAX_TILES = 36                 # refuse views that cover more tiles than this
TTL_SECONDS = 7 * 24 * 3600    # re-fetch a tile after a week
DB_PATH = Path(__file__).with_name("places_cache.sqlite3")

# Put a real contact here: the Overpass operators ask for an identifying User-Agent.
USER_AGENT = "congenial-pancake/1.0 (PFAS education project; contact: workwithlag@gmail.com)"

# Tried in order. Worldwide instances only (see the OSM wiki's Overpass instance list).
SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

POI_KEYS = ("amenity", "shop", "tourism", "leisure", "office")
# Unnamed things (benches, bins, parking spaces...) are most of the data in a city
# and useless as game clues. Set to False to get them back (slower, much bigger).
NAMED_ONLY = True

# ---- PFAS source rules ------------------------------------------------------
# Edit this block to change which OpenStreetMap features get a red "possible PFAS
# source" pin. Each category lists tag keys; None matches any value of that key,
# a list matches only those values. Bump PFAS_RULES_VERSION after editing so the
# cached tiles are re-fetched with the new rules.
PFAS_RULES_VERSION = 2
PFAS_CATEGORIES = [
    {
        "id": "military_fire",
        "label": "Military & firefighting",
        "tags": {
            "military": None,
            "landuse": ["military"],
            "amenity": ["fire_station"],
        },
    },
    {
        "id": "waste",
        "label": "Waste & wastewater",
        "tags": {
            "landuse": ["landfill"],
            "amenity": ["waste_transfer_station"],
            "man_made": ["wastewater_plant"],
        },
    },
    {
        "id": "industry",
        "label": "Industry",
        "tags": {
            "landuse": ["industrial"],
            "man_made": ["works"],
        },
    },
    # Turned off to keep queries light and pins few. To re-enable, move a block
    # above the closing bracket and bump PFAS_RULES_VERSION:
    #   {"id": "airports", "label": "Airports & airfields", "tags": {"aeroway": ["aerodrome"]}},
    #   {"id": "transport", "label": "Rail yards & ports", "tags": {"landuse": ["railway", "port"]}},
    #   industry extras: "industrial": None, "shop": ["dry_cleaning"]
]
PFAS_KIND = f"pfas-v{PFAS_RULES_VERSION}"   # cache key; changes with the rules
MAX_PFAS_RESULTS = 2000


def _tag_matches(tags, key, values):
    return key in tags and (values is None or tags[key] in values)


def classify_pfas(tags):
    """-> (category_id, "key=value, key=value") or None if nothing matches."""
    for cat in PFAS_CATEGORIES:
        hits = [f"{k}={tags[k]}" for k, v in cat["tags"].items() if _tag_matches(tags, k, v)]
        if hits:
            return cat["id"], ", ".join(hits)
    return None


def _pfas_filters(bbox):
    """Overpass filter lines for every rule (one per key, values merged)."""
    merged = {}
    for cat in PFAS_CATEGORIES:
        for k, v in cat["tags"].items():
            if k in merged and merged[k] is None:
                continue
            merged[k] = None if v is None else sorted(set(merged.get(k) or []) | set(v))
    lines = []
    for k, v in merged.items():
        cond = f'["{k}"]' if v is None else f'["{k}"~"^({"|".join(v)})$"]'
        lines.append(f"nw{cond}({bbox});")
    return "".join(lines)


UPSTREAM_TIMEOUT = 45.0        # busy public servers can take a while; first answer wins
MIN_GAP_SECONDS = 0.3          # pause between upstream queries, to stay polite

# ---- internal state ---------------------------------------------------------
_upstream = asyncio.Semaphore(1)   # one Overpass query at a time
_last_call = 0.0
_inflight: dict = {}               # (kind, x0, y0, x1, y1) -> Future


# ---- tile math (standard web-mercator "slippy map" tiles) -------------------
def lonlat_to_tile(lon: float, lat: float, z: int = ZOOM):
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


def tile_bounds(x: int, y: int, z: int = ZOOM):
    """(south, west, north, east) of a tile."""
    n = 2 ** z
    west = x / n * 360.0 - 180.0
    east = (x + 1) / n * 360.0 - 180.0
    north = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    south = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return south, west, north, east


# ---- cache ------------------------------------------------------------------
def _db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.execute(
        "CREATE TABLE IF NOT EXISTS tiles ("
        " kind TEXT, z INTEGER, x INTEGER, y INTEGER, fetched REAL, data TEXT,"
        " PRIMARY KEY (kind, z, x, y))"
    )
    return con


def _missing_tiles(kind, tiles):
    cutoff = time.time() - TTL_SECONDS
    con = _db()
    try:
        fresh = {
            (x, y)
            for x, y in tiles
            if con.execute(
                "SELECT 1 FROM tiles WHERE kind=? AND z=? AND x=? AND y=? AND fetched>?",
                (kind, ZOOM, x, y, cutoff),
            ).fetchone()
        }
    finally:
        con.close()
    return [t for t in tiles if t not in fresh]


# ---- Overpass ---------------------------------------------------------------
def build_query(kind, south, west, north, east):
    bbox = f"{south},{west},{north},{east}"
    if kind == PFAS_KIND:
        return f"[out:json][timeout:40];({_pfas_filters(bbox)});out tags center qt;"
    if kind == "poi":
        name = '["name"]' if NAMED_ONLY else ""
        parts = "".join(f'nwr["{k}"]{name}({bbox});' for k in POI_KEYS)
        return f"[out:json][timeout:20];({parts});out tags center qt;"
    return f'[out:json][timeout:30];nwr["building"]({bbox});out tags center qt;'


def slim(el, kind):
    """Keep only what the UI uses, so the cache and the response stay small."""
    center = el.get("center") or {}
    lat = el.get("lat", center.get("lat"))
    lon = el.get("lon", center.get("lon"))
    if lat is None or lon is None:
        return None
    tags = el.get("tags") or {}
    if kind == PFAS_KIND:
        hit = classify_pfas(tags)
        if hit is None:
            return None
        return {
            "type": el.get("type"), "id": el.get("id"), "lat": lat, "lon": lon,
            "tags": {"name": tags["name"]} if "name" in tags else {},
            "cat": hit[0], "match": hit[1],
        }
    if kind == "poi":
        keep = {k: tags[k] for k in ("name", *POI_KEYS) if k in tags}
    else:
        keep = {"building": tags.get("building", "yes")}
    return {"type": el.get("type"), "id": el.get("id"), "lat": lat, "lon": lon, "tags": keep}


async def _post_one(client, url, query):
    r = await client.post(url, data={"data": query})
    if r.status_code != 200:
        raise RuntimeError(f"{url} returned {r.status_code}")
    data = r.json()
    # Overpass can answer 200 with a runtime error in "remark" (e.g. timed out).
    # Don't cache partial results.
    if "error" in str(data.get("remark", "")).lower():
        raise RuntimeError(f"{url}: {data['remark']}")
    return data


async def _overpass(query: str) -> dict:
    """Ask every server at once; the first good answer wins, the rest are cancelled."""
    global _last_call
    async with _upstream:
        wait = MIN_GAP_SECONDS - (time.monotonic() - _last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        errors = []
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(UPSTREAM_TIMEOUT, connect=4.0),
                headers={"User-Agent": USER_AGENT},
            ) as client:
                pending = {asyncio.ensure_future(_post_one(client, u, query)) for u in SERVERS}
                try:
                    while pending:
                        done, pending = await asyncio.wait(
                            pending, return_when=asyncio.FIRST_COMPLETED
                        )
                        for t in done:
                            try:
                                return t.result()
                            except (httpx.HTTPError, ValueError, RuntimeError) as err:
                                errors.append(repr(err))
                finally:
                    for t in pending:
                        t.cancel()
        finally:
            _last_call = time.monotonic()
    raise HTTPException(502, "All Overpass servers failed (" + "; ".join(errors) + ")")


async def _fetch_rect(kind, x0, y0, x1, y1):
    """One Overpass query for a block of tiles; store each tile separately."""
    south = tile_bounds(x0, y1)[0]
    west = tile_bounds(x0, y0)[1]
    north = tile_bounds(x0, y0)[2]
    east = tile_bounds(x1, y0)[3]
    data = await _overpass(build_query(kind, south, west, north, east))

    buckets = {(x, y): [] for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}
    for el in data.get("elements", []):
        s = slim(el, kind)
        if s is None:
            continue
        tile = lonlat_to_tile(s["lon"], s["lat"])
        if tile in buckets:
            buckets[tile].append(s)

    now = time.time()
    con = _db()
    try:
        con.executemany(
            "INSERT OR REPLACE INTO tiles (kind, z, x, y, fetched, data) VALUES (?,?,?,?,?,?)",
            [(kind, ZOOM, x, y, now, json.dumps(v)) for (x, y), v in buckets.items()],
        )
        con.commit()
    finally:
        con.close()


async def _ensure_tiles(kind, tiles) -> int:
    missing = _missing_tiles(kind, tiles)
    if not missing:
        return 0
    xs = [t[0] for t in missing]
    ys = [t[1] for t in missing]
    key = (kind, min(xs), min(ys), max(xs), max(ys))

    fut = _inflight.get(key)
    if fut is None:  # nobody is fetching this block yet
        fut = asyncio.ensure_future(_fetch_rect(*key))
        _inflight[key] = fut
        fut.add_done_callback(lambda _f, k=key: _inflight.pop(k, None))
    # shield: if this client disconnects, the shared fetch keeps going and still fills the cache
    await asyncio.shield(fut)
    return len(missing)


# ---- endpoint ---------------------------------------------------------------
@router.get("/api/places")
async def get_places(
    south: float = Query(..., ge=-85, le=85),
    west: float = Query(..., ge=-180, le=180),
    north: float = Query(..., ge=-85, le=85),
    east: float = Query(..., ge=-180, le=180),
    kind: str = Query("poi", pattern="^(poi|building|pfas)$"),
):
    if north <= south or east <= west:
        raise HTTPException(400, "Invalid bounds.")

    x0, y1 = lonlat_to_tile(west, south)   # south-west corner (largest y)
    x1, y0 = lonlat_to_tile(east, north)   # north-east corner (smallest y)
    tiles = [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
    if len(tiles) > MAX_TILES:
        raise HTTPException(400, "View is too large. Zoom in.")

    if kind == "pfas":
        kind = PFAS_KIND   # versioned, so edited rules never serve stale cache
    fetched = await _ensure_tiles(kind, tiles)

    elements = []
    con = _db()
    try:
        for x, y in tiles:
            row = con.execute(
                "SELECT data FROM tiles WHERE kind=? AND z=? AND x=? AND y=?",
                (kind, ZOOM, x, y),
            ).fetchone()
            if row:
                elements.extend(json.loads(row[0]))
    finally:
        con.close()

    # Tiles stick out past the view; the browser clips to the exact bounds.
    if kind == PFAS_KIND:
        elements = elements[:MAX_PFAS_RESULTS]
    return {"elements": elements, "tiles": len(tiles), "fetched_tiles": fetched}


@router.get("/api/pfas-categories")
async def pfas_categories():
    """Category ids + labels, so the UI legend never drifts from the rules."""
    return [{"id": c["id"], "label": c["label"]} for c in PFAS_CATEGORIES]