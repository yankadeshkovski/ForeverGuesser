# heatmap.py  -- PFAS "where is it most concentrated?" heatmap + guess scoring.
# Nothing here is stored: every request builds the field from scratch and returns it.
import math

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

# ---------------------------------------------------------------- model constants
# All distances are in METRES. The raw field is rescaled PER MAP so the lowest
# cell is always 0 and the highest is always 100.
LAND_CORE = 1500.0     # m: strong inner zone around a source (Gaussian)
LAND_TAIL = 5000.0     # m: long faint tail that carries PFAS much further out (exponential)
CORE_SHARE = 0.5       # how much of a source's strength is in the core vs the tail
SATURATION = 70.0      # summed strength that maps to ~63; overlapping sources stack toward 100
GRID_LONG_SIDE = 120   # cells along the longer side of the view

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


# ---------------------------------------------------------------- the field
def heat_at(P, src_xy, src_w):
    """PFAS 'closeness' (0-100, before per-map scaling) at each point of P (N,2), in metres.
    Used for the whole grid AND for the guess, so both always agree."""
    if len(src_xy) == 0:
        return np.zeros(len(P))

    d = np.sqrt(((P[:, None, :] - src_xy[None, :, :]) ** 2).sum(-1))  # N x K
    # Each source: strong core + long tail. Sources simply ADD, so a cluster of
    # points reinforces itself and the area around it lights up more than any one alone.
    kernel = CORE_SHARE * np.exp(-((d / LAND_CORE) ** 2)) + (1 - CORE_SHARE) * np.exp(-d / LAND_TAIL)
    strength = (src_w * kernel).sum(axis=1)

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

    raw = heat_at(grid, src_xy, src_w)
    lo, hi = float(raw.min()), float(raw.max())
    span = hi - lo

    def scale(x):
        # Stretch so this map always contains a 0 and a 100
        if span < 1e-9:
            return np.zeros_like(x)
        return np.clip((x - lo) / span * 100.0, 0.0, 100.0)

    values = np.rint(scale(raw)).astype(int).reshape(rows, cols)

    # Same field and same scaling for the guess, so score == colour under the dot
    guess_xy = np.array([to_xy(req.guess.lat, req.guess.lng)])
    score = int(np.rint(scale(heat_at(guess_xy, src_xy, src_w))[0]))

    # Where the 100 is (centre of the hottest cell), for the "perfect guess" marker
    peak = None
    if span >= 1e-9:
        i, j = divmod(int(np.argmax(raw)), cols)
        peak = {
            "lat": b.south + float(ys[i]) / m_lat,
            "lng": b.west + float(xs[j]) / m_lng,
        }

    return {
        "rows": rows,
        "cols": cols,
        "values": values.tolist(),
        "score": score,
        "peak": peak,
        "sources_used": len(visible),
    }