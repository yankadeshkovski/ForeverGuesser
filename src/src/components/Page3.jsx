import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./page3.css";

// ======================= EDIT THESE =======================
const LOCKED = true; // starting state: true = frozen on the fragment below (the Lock button can toggle it)
const START_MODE = "fitBounds"; // "fitBounds" or "setView"

// Used when START_MODE is "fitBounds": [[south, west], [north, east]
// const VIEW_BOUNDS = [[40.7118, -74.0075],[40.7138, -74.0045],];
const VIEW_BOUNDS = [[40.763381, -73.921509], [40.851605, -73.657837],];

// Used when START_MODE is "setView"
const VIEW_CENTER = [40.807493, -73.789673]; // [lat, lng]
const VIEW_ZOOM = 13;

const LOCK_MIN_ZOOM = 17; // when you press Lock yourself, you must be zoomed in at least this far
// ==========================================================

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

const fmt = (n) => n.toFixed(6); // about 0.1 m of precision

// Put the map on the chosen fragment (no animation, so the lock can't catch it mid-move)
function applyView(map) {
  if (START_MODE === "setView") {
    map.setView(VIEW_CENTER, VIEW_ZOOM, { animate: false });
  } else {
    map.fitBounds(VIEW_BOUNDS, { animate: false });
  }
}

export default function Page3() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const zoomRef = useRef(null); // the +/- buttons, so they can be hidden while locked
  const layerRef = useRef(null); // holds the dots drawn for clicked points
  const counterRef = useRef(0); // numbers the clicked points
  const noticeTimer = useRef(null);
  const lockedRef = useRef(LOCKED); // lets the startup timer know if the map is still locked
  const [locked, setLocked] = useState(LOCKED);
  const [notice, setNotice] = useState("");
  const [points, setPoints] = useState([]);

  // Create the map once
  useEffect(() => {
    // Guard against double-initialisation (React StrictMode runs effects twice in dev)
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      minZoom: MIN_ZOOM,
      maxBounds: WORLD_BOUNDS,
      maxBoundsViscosity: 1.0,
      zoomControl: false, // added below at the bottom right, away from the points panel
    });

    applyView(map);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      minZoom: MIN_ZOOM,
      maxZoom: 19,
      noWrap: true,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    zoomRef.current = L.control.zoom({ position: "bottomright" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Record every click as a numbered point
    map.on("click", (e) => {
      const n = ++counterRef.current;
      const { lat, lng } = e.latlng;

      L.circleMarker([lat, lng], {
        radius: 6,
        color: "#ffffff",
        weight: 2,
        fillColor: "#d93025",
        fillOpacity: 1,
        interactive: false, // clicks pass through to the map
      })
        .bindTooltip(String(n), { permanent: true, direction: "top", offset: [0, -6] })
        .addTo(layerRef.current);

      setPoints((prev) => [...prev, { id: n, lat, lng }]);
    });

    // Once the layout has settled, re-measure and re-apply the same fragment
    const timer = setTimeout(() => {
      map.invalidateSize({ animate: false });
      if (mapRef.current && lockedRef.current) applyView(map);
    }, 100);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      zoomRef.current = null;
      layerRef.current = null;
      counterRef.current = 0;
    };
  }, []);

  // Keep the startup timer's view of "locked" up to date
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  // Lock / unlock zoom and movement (also runs once at startup to apply LOCKED)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    HANDLERS.forEach((name) => {
      if (map[name]) locked ? map[name].disable() : map[name].enable();
    });

    // Hide the +/- buttons while locked so zoom can't be changed that way either
    if (zoomRef.current) {
      zoomRef.current.getContainer().style.display = locked ? "none" : "";
    }
  }, [locked]);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const handleLockClick = () => {
    const map = mapRef.current;
    if (!map) return;

    // Unlocking is always allowed; locking needs enough zoom
    if (!locked && map.getZoom() < LOCK_MIN_ZOOM) {
      setNotice("Zoom in further before locking the map.");
      clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(""), 3500);
      return;
    }
    setNotice("");
    setLocked((v) => !v);
  };

  const handleClear = () => {
    layerRef.current?.clearLayers();
    counterRef.current = 0;
    setPoints([]);
  };

  return (
    <div className="page3">
      <div ref={containerRef} className="page3-map" />

      <button
        type="button"
        className={`page3-lock${locked ? " is-locked" : ""}`}
        onClick={handleLockClick}
        aria-pressed={locked}
      >
        {locked ? "Unlock" : "Lock"}
      </button>

      {notice && (
        <div className="page3-notice" role="alert">
          {notice}
        </div>
      )}

      <aside className="page3-panel" aria-label="Clicked coordinates">
        <div className="page3-panel-head">
          <h2>Clicked points ({points.length})</h2>
          <button
            type="button"
            className="page3-clear"
            onClick={handleClear}
            disabled={points.length === 0}
          >
            Clear
          </button>
        </div>

        {points.length === 0 ? (
          <p className="page3-empty">Click the map to record a point.</p>
        ) : (
          <ol className="page3-points">
            {points.map((p) => (
              <li key={p.id}>
                <span className="page3-num">{p.id}.</span>
                <span>
                  {fmt(p.lat)}, {fmt(p.lng)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </aside>

      <nav className="page3-nav" aria-label="Main">
        <a href="#/">Landing</a>
        <a href="#/page2">Page 2</a>
      </nav>
    </div>
  );
}