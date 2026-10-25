import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./page3.css";
import { MAPS, POINTS_BY_MAP } from "./mapsData";
import { getHeatmap } from "../api"; // adjust the path to wherever api.js lives

const LOCKED = true; // starting state

const MIN_ZOOM = 3;
const WORLD_BOUNDS = [
  [-85, -180],
  [85, 180],
];

// Every Leaflet interaction that moves or zooms the map
const HANDLERS = [
  "dragging",
  "touchZoom",
  "doubleClickZoom",
  "scrollWheelZoom",
  "boxZoom",
  "keyboard",
];

// Heatmap colours: 0 = far from PFAS (yellow) ... 100 = close (purple).
// Fixed stops, so the same value is always the same colour on every map.
const RAMP = [
  [0, [255, 233, 77]],
  [35, [246, 166, 35]],
  [65, [214, 51, 108]],
  [100, [91, 26, 143]],
];
const HEAT_OPACITY = 0.6;

// Every point from every map, for freeroam
const ALL_POINTS = Object.values(POINTS_BY_MAP).flat();

function rampColor(v) {
  for (let i = 1; i < RAMP.length; i++) {
    const [v1, c1] = RAMP[i];
    if (v <= v1) {
      const [v0, c0] = RAMP[i - 1];
      const t = (v - v0) / (v1 - v0);
      return c0.map((c, k) => Math.round(c + (c1[k] - c) * t));
    }
  }
  return RAMP[RAMP.length - 1][1];
}
const LEGEND_GRADIENT = `linear-gradient(to right, ${RAMP.map(
  ([v, c]) => `rgb(${c.join(",")}) ${v}%`
).join(", ")})`;

// Put the map on a given map's saved view (no animation)
function applyView(map, m) {
  map.setView(m.center, m.zoom, { animate: false });
}

export default function Page3() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const zoomRef = useRef(null);
  const poiLayerRef = useRef(null); // red points with their name tags
  const guessLayerRef = useRef(null); // the blue guess dot
  const peakLayerRef = useRef(null); // the X marking where the 100 is
  const reqRef = useRef(0); // lets us ignore API replies that arrive after the user moved on
  const [ready, setReady] = useState(false); // true once the Leaflet map exists
  const [locked, setLocked] = useState(LOCKED);
  const [index, setIndex] = useState(0);
  // The current guess: { lat, lng, submitted, score } or null. Forgotten on map change or freeroam.
  const [guess, setGuess] = useState(null);
  // The heatmap for the current guess: { rows, cols, values, bounds, peak } or null
  const [heat, setHeat] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const current = MAPS[index];
  const submitted = !!guess?.submitted;

  // Forget the guess, the heatmap and any request still in flight
  const resetGuess = () => {
    reqRef.current++;
    setGuess(null);
    setHeat(null);
    setLoading(false);
    setError("");
  };

  // Create the map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      minZoom: MIN_ZOOM,
      maxBounds: WORLD_BOUNDS,
      maxBoundsViscosity: 1.0,
      zoomControl: false,
    });

    // Heatmap sits above the tiles but under the red points and the guess dot
    map.createPane("heatPane").style.zIndex = 350;

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      minZoom: MIN_ZOOM,
      maxZoom: 19,
      noWrap: true,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    zoomRef.current = L.control.zoom({ position: "bottomright" }).addTo(map);
    poiLayerRef.current = L.layerGroup().addTo(map);
    guessLayerRef.current = L.layerGroup().addTo(map);
    peakLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setReady(true);

    // Re-measure once the layout has settled
    const timer = setTimeout(() => map.invalidateSize({ animate: false }), 100);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      zoomRef.current = null;
      poiLayerRef.current = null;
      guessLayerRef.current = null;
      peakLayerRef.current = null;
      setReady(false);
    };
  }, []);

  // Move to the selected map's fixed view
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    applyView(map, current);
  }, [ready, index]);

  // Red points: locked = only this map's, with always-visible name tags.
  // Freeroam = every point from every map around the world (name shows on hover).
  useEffect(() => {
    if (!ready || !poiLayerRef.current) return;

    poiLayerRef.current.clearLayers();
    const pts = locked ? POINTS_BY_MAP[current.id] || [] : ALL_POINTS;
    pts.forEach((p) => {
      const dot = L.circleMarker([p.lat, p.lng], {
        radius: locked ? 7 : 6,
        color: "#ffffff",
        weight: 2,
        fillColor: "#d93025",
        fillOpacity: 1,
        interactive: !locked, // locked: clicks pass through so you can guess on top of a point
      });
      if (locked) {
        dot.bindTooltip(p.type, {
          permanent: true,
          direction: "top",
          offset: [0, -8],
          className: "page3-poi-tag",
        });
      } else {
        dot.bindTooltip(p.type, { direction: "top", offset: [0, -6] });
      }
      dot.addTo(poiLayerRef.current);
    });
  }, [ready, index, locked]);

  // Click the map to place or move the blue guess dot (only while locked and not submitted)
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || submitted || !locked) return;

    const onClick = (e) => {
      const { lat, lng } = e.latlng;
      setError("");
      setGuess({ lat, lng, submitted: false, score: null });
    };
    map.on("click", onClick);
    return () => map.off("click", onClick);
  }, [ready, index, submitted, locked]);

  // Draw the blue guess dot; draggable until submitted
  useEffect(() => {
    if (!ready || !guessLayerRef.current) return;
    guessLayerRef.current.clearLayers();
    if (!guess || !locked) return;

    const marker = L.marker([guess.lat, guess.lng], {
      draggable: !guess.submitted,
      keyboard: false,
      icon: L.divIcon({
        className: `page3-guess${guess.submitted ? " is-submitted" : ""}`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    }).addTo(guessLayerRef.current);

    if (!guess.submitted) {
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLatLng();
        setGuess((prev) => (prev ? { ...prev, lat, lng } : prev));
      });
    }
  }, [ready, index, guess, locked]);

  // Paint the heatmap over the map fragment
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !heat || !locked) return;

    const canvas = document.createElement("canvas");
    canvas.width = heat.cols;
    canvas.height = heat.rows;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(heat.cols, heat.rows);
    const lut = Array.from({ length: 101 }, (_, v) => rampColor(v));
    heat.values.forEach((row, y) =>
      row.forEach((v, x) => {
        const [r, g, b] = lut[Math.max(0, Math.min(100, v))];
        const o = (y * heat.cols + x) * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      })
    );
    ctx.putImageData(img, 0, 0);

    const overlay = L.imageOverlay(canvas.toDataURL(), heat.bounds, {
      pane: "heatPane",
      opacity: HEAT_OPACITY,
      interactive: false,
    }).addTo(map);
    return () => overlay.remove();
  }, [ready, heat, locked]);

  // Mark where the 100 is with an X, as soon as the heatmap arrives
  useEffect(() => {
    if (!ready || !peakLayerRef.current) return;
    peakLayerRef.current.clearLayers();
    if (!heat || !heat.peak || !locked) return;

    L.marker([heat.peak.lat, heat.peak.lng], {
      keyboard: false,
      interactive: false,
      zIndexOffset: 1000,
      icon: L.divIcon({
        className: "page3-peak",
        html: "✕",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    })
      .bindTooltip("Highest PFAS Concentration", {
        permanent: true,
        direction: "top",
        offset: [0, -12],
        className: "page3-peak-tag",
      })
      .addTo(peakLayerRef.current);
  }, [ready, heat, locked]);

  // Lock / unlock zoom and movement
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    HANDLERS.forEach((name) => {
      if (map[name]) locked ? map[name].disable() : map[name].enable();
    });

    if (zoomRef.current) {
      zoomRef.current.getContainer().style.display = locked ? "none" : "";
    }
  }, [ready, locked]);

  // Sequential cycle: 1 -> 2 -> ... -> 15 -> 1
  // Changing maps always lands on the locked, fixed view and forgets the guess and heatmap
  const go = (delta) => {
    resetGuess();
    setLocked(true);
    setIndex((i) => (i + delta + MAPS.length) % MAPS.length);
  };

  const handleModeClick = () => {
    const map = mapRef.current;
    if (!map) return;
    if (locked) {
      // Entering freeroam forgets the guess, score and heatmap
      resetGuess();
      setLocked(false);
    } else {
      // Locking snaps back to this map's fixed fragment
      applyView(map, current);
      setLocked(true);
    }
  };

  const handleSubmit = async () => {
    const map = mapRef.current;
    if (!map || !locked || !guess || submitted || loading) return;

    const id = ++reqRef.current;
    const b = map.getBounds(); // exactly what the player can see
    const bounds = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };

    setError("");
    setLoading(true);
    setGuess((prev) => ({ ...prev, submitted: true })); // freeze the dot while the API works

    try {
      const res = await getHeatmap(bounds, POINTS_BY_MAP[current.id] || [], {
        lat: guess.lat,
        lng: guess.lng,
      });
      if (id !== reqRef.current) return; // user moved on; drop the result
      setHeat({
        rows: res.rows,
        cols: res.cols,
        values: res.values,
        peak: res.peak,
        bounds: [
          [bounds.south, bounds.west],
          [bounds.north, bounds.east],
        ],
      });
      setGuess((prev) => (prev ? { ...prev, score: res.score } : prev));
      setLoading(false);
    } catch (err) {
      if (id !== reqRef.current) return;
      setGuess((prev) => (prev ? { ...prev, submitted: false } : prev)); // let them try again
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="page3">
      <div ref={containerRef} className="page3-map" />

      {locked && (
        <div className="page3-score" aria-live="polite">
          <div className="page3-score-row">
            <span>Score</span>
            <strong>{submitted ? (guess.score ?? "…") : "–"}</strong>
          </div>
          {heat && (
            <div className="page3-scale-wrap">
              <div className="page3-scale" style={{ background: LEGEND_GRADIENT }} />
              <div className="page3-scale-ends">
                <span>0</span>
                <span>100</span>
              </div>
              <div className="page3-scale-caption">Scaled PFAS Concentration</div>
            </div>
          )}
        </div>
      )}

      <div className="page3-topright">
        <div className="page3-cycle">
          <button type="button" onClick={() => go(-1)} aria-label="Previous map">
            ‹
          </button>
          <span className="page3-label">
            Map {current.id} of {MAPS.length}
          </span>
          <button type="button" onClick={() => go(1)} aria-label="Next map">
            ›
          </button>
        </div>

        <button
          type="button"
          className={`page3-lock${locked ? "" : " is-freeroam"}`}
          onClick={handleModeClick}
        >
          {locked ? "FREEROAM" : "Lock"}
        </button>

        <button
          type="button"
          className="page3-submit"
          onClick={handleSubmit}
          disabled={!locked || !guess || submitted || loading}
        >
          {loading ? "BUILDING HEATMAP…" : submitted ? "GUESS SUBMITTED" : "SUBMIT GUESS"}
        </button>

        {error && (
          <div className="page3-error" role="alert">
            {error}
          </div>
        )}
      </div>

      <nav className="page3-nav" aria-label="Main">
        <a href="#/">Landing</a>
        <a href="#/page2">Page 2</a>
      </nav>
    </div>
  );
}