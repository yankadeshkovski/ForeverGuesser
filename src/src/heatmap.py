# heatmap.py  -- PFAS "where is it most concentrated?" heatmap + guess scoring.
# Nothing here is stored: every request builds the field from scratch and returns it.
import json
import math
import urllib.parse
import urllib.request

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

# ---------------------------------------------------------------- model constants
# All distances are in METRES, so the same physical situation gives the same value
# on every map. That is what keeps colours/scores consistent between maps.
LAND_CORE = 1500.0      # m: strong inner zone around a source (Gaussian)
LAND_TAIL = 5000.0     # m: long faint tail that carries PFAS much further out (exponential)
CORE_SHARE = 0.5       # how much of a source's strength is in the core vs the tail
PLUME_LEN = 15000.0     # m: how far PFAS travels along waterways (exponential)
WATER_DECAY = 250.0    # m: width of the corridor around a waterway that gets the plume
SATURATION = 70.0      # summed strength that maps to ~63; overlapping sources stack toward 100
GRID_LONG_SIDE = 120   # cells along the longer side of the view
WATER_STEP_M = 30.0    # spacing of sample points along waterways
MAX_WATER_SAMPLES = 3000

# Rough PFAS-release strength of each kind of place (0-100)
WEIGHTS = {
    "PFAS Producer (firefighting foam)": 100,
    "Chemical Compounds Company": 85,
    "Military Airfield": 75,
    "Military Training Base": 75,
    "Airbase": 75,
    "Airport": 70,
    "Landfill": 70,
    "Textiles Factory": 60,
    "Garments Manufacturer": 60,
    "Industrial Factory": 55,
    "Industrial Plant": 55,
    "Industrial Complex with Plants": 55,
    "Industrial Park": 55,
    "Waste Management Service": 55,
    "Wastewater Treatment Facility": 50,
    "Water Treatment Facility": 50,
    "Seaplane Base": 45,
    "Fire Station": 40,
    "Port": 40,
    "Nestle Factory": 30,
    "Coca Cola Factory": 30,
    "Major Transport Hub": 25,
    "Train Station": 20,
    "Logging Company": 20,
    "University": 15,
}
DEFAULT_WEIGHT = 30

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


# ---------------------------------------------------------------- request model
class Bounds(BaseModel):
    south: float
    west: float
    north: float
    east: float


class Poi(BaseModel):
    type: str = Field(max_length=100)
    lat: float
    lng: float


class LatLng(BaseModel):
    lat: float
    lng: float


class HeatmapRequest(BaseModel):
    bounds: Bounds
    points: list[Poi] = Field(max_length=200)
    guess: LatLng


# ---------------------------------------------------------------- waterways
def fetch_waterways(b: Bounds):
    """Waterway/lake geometry inside the view from OpenStreetMap (Overpass).
    Returns a list of ways, each a list of (lat, lng), or None if unavailable."""
    s, w, n, e = b.south, b.west, b.north, b.east
    query = (
        "[out:json][timeout:20];("
        f'way["waterway"~"^(river|stream|canal|drain|ditch)$"]({s},{w},{n},{e});'
        f'way["natural"="water"]({s},{w},{n},{e});'
        ");out geom;"
    )
    req = urllib.request.Request(
        OVERPASS_URL,
        data=urllib.parse.urlencode({"data": query}).encode(),
        headers={"User-Agent": "pfas-heatmap-game/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.load(resp)
    except Exception:
        return None

    ways = []
    for el in data.get("elements", []):
        geom = el.get("geometry")
        if geom and len(geom) >= 2:
            ways.append([(p["lat"], p["lon"]) for p in geom])
    return ways


def water_samples(ways, to_xy, width_m, height_m):
    """Densify the waterways into points (metres) that lie inside the view."""
    pts = []
    for way in ways:
        xy = [to_xy(lat, lng) for lat, lng in way]
        for (x0, y0), (x1, y1) in zip(xy, xy[1:]):
            length = math.hypot(x1 - x0, y1 - y0)
            n = max(1, math.ceil(length / WATER_STEP_M))
            t = np.linspace(0.0, 1.0, n + 1)
            pts.append(np.column_stack((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)))
    if not pts:
        return None
    arr = np.vstack(pts)
    # Only what is visible counts
    inside = (arr[:, 0] >= 0) & (arr[:, 0] <= width_m) & (arr[:, 1] >= 0) & (arr[:, 1] <= height_m)
    arr = arr[inside]
    if len(arr) == 0:
        return None
    if len(arr) > MAX_WATER_SAMPLES:
        arr = arr[:: math.ceil(len(arr) / MAX_WATER_SAMPLES)]
    return arr


def min_dist(P, S, chunk=400):
    """Distance from every point in P (N,2) to its nearest point in S (M,2)."""
    out = np.empty(len(P))
    for i in range(0, len(P), chunk):
        c = P[i : i + chunk]
        d2 = (c[:, 0, None] - S[None, :, 0]) ** 2 + (c[:, 1, None] - S[None, :, 1]) ** 2
        out[i : i + chunk] = np.sqrt(d2.min(axis=1))
    return out


# ---------------------------------------------------------------- the field
def heat_at(P, src_xy, src_w, water):
    """PFAS 'closeness' 0-100 at each point of P (N,2), in metres.
    Used for the whole grid AND for the guess, so both always agree."""
    if len(src_xy) == 0:
        return np.zeros(len(P))

    d = np.sqrt(((P[:, None, :] - src_xy[None, :, :]) ** 2).sum(-1))  # N x K
    # Each source: strong core + long tail. Sources simply ADD, so a cluster of
    # points reinforces itself and the area around it lights up more than any one alone.
    kernel = CORE_SHARE * np.exp(-((d / LAND_CORE) ** 2)) + (1 - CORE_SHARE) * np.exp(-d / LAND_TAIL)
    strength = (src_w * kernel).sum(axis=1)

    if water is not None:
        # Waterways carry PFAS far: any source feeds the water (more if it sits on it),
        # and cells along the water pick that up from a long way off.
        src_on_water = np.exp(-min_dist(src_xy, water) / WATER_DECAY)
        cell_on_water = np.exp(-min_dist(P, water) / WATER_DECAY)
        plume = (src_w * (0.7 + 0.3 * src_on_water) * np.exp(-d / PLUME_LEN)).sum(axis=1)
        strength = strength + plume * cell_on_water

    return 100.0 * (1.0 - np.exp(-strength / SATURATION))


# ---------------------------------------------------------------- endpoint
@router.post("/api/heatmap")
def heatmap(req: HeatmapRequest):
    b = req.bounds
    if not (-90 <= b.south < b.north <= 90 and -180 <= b.west < b.east <= 180):
        raise HTTPException(400, "Invalid map bounds.")
    if (b.north - b.south) > 1.0 or (b.east - b.west) > 1.0:
        raise HTTPException(400, "Map area is too large (max 1 degree on a side).")
    if not (b.south <= req.guess.lat <= b.north and b.west <= req.guess.lng <= b.east):
        raise HTTPException(400, "Guess must be inside the visible map.")

    # Local metric projection (metres from the south-west corner)
    lat0 = (b.south + b.north) / 2
    m_lat = 110_540.0
    m_lng = 111_320.0 * math.cos(math.radians(lat0))
    width_m = (b.east - b.west) * m_lng
    height_m = (b.north - b.south) * m_lat

    def to_xy(lat, lng):
        return ((lng - b.west) * m_lng, (lat - b.south) * m_lat)

    # Only points of interest that can be seen count
    visible = [
        p for p in req.points
        if b.south <= p.lat <= b.north and b.west <= p.lng <= b.east
    ]
    src_xy = np.array([to_xy(p.lat, p.lng) for p in visible]).reshape(-1, 2)
    src_w = np.array([WEIGHTS.get(p.type, DEFAULT_WEIGHT) for p in visible], dtype=float)

    ways = fetch_waterways(b)
    water = water_samples(ways, to_xy, width_m, height_m) if ways else None

    # Grid of cell centres, row 0 = north edge (image order)
    if width_m >= height_m:
        cols = GRID_LONG_SIDE
        rows = max(16, round(GRID_LONG_SIDE * height_m / width_m))
    else:
        rows = GRID_LONG_SIDE
        cols = max(16, round(GRID_LONG_SIDE * width_m / height_m))
    xs = (np.arange(cols) + 0.5) / cols * width_m
    ys = height_m - (np.arange(rows) + 0.5) / rows * height_m
    gx, gy = np.meshgrid(xs, ys)
    grid = np.column_stack((gx.ravel(), gy.ravel()))

    values = np.rint(heat_at(grid, src_xy, src_w, water)).astype(int).reshape(rows, cols)

    guess_xy = np.array([to_xy(req.guess.lat, req.guess.lng)])
    score = int(np.rint(heat_at(guess_xy, src_xy, src_w, water)[0]))

    return {
        "rows": rows,
        "cols": cols,
        "values": values.tolist(),
        "score": score,
        "water_used": water is not None,
        "sources_used": len(visible),
    }