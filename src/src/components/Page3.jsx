import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./page3.css";

const DEFAULT_CENTER = [40.7128, -74.006]; // [lat, lng]
const DEFAULT_ZOOM = 17;
const LOCK_MIN_ZOOM = 17; // must be zoomed in at least this far to lock
const MIN_ZOOM = 3; // max zoom out: lower = see more of the world (0 = whole world)
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

// ---- POI / building lookup (OpenStreetMap data via the Overpass API) ----
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const POI_KEYS = ["amenity", "shop", "tourism", "leisure", "office"];
const MAX_PINS = 500;

const EMPTY_POIS = { status: "idle", pois: [], total: 0, buildings: [], error: "" };

const pretty = (s) => s.replace(/_/g, " ");

function buildQuery(b) {
  const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
  const poiParts = POI_KEYS.map((k) => `nwr["${k}"](${bbox});`).join("");
  return `[out:json][timeout:25];(${poiParts}nwr["building"](${bbox}););out center tags;`;
}

async function fetchOverpass(query, signal) {
  let lastError;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal,
      });
      if (!res.ok) throw new Error(`Overpass returned ${res.status}`);
      return await res.json();
    } catch (err) {
      if (err.name === "AbortError") throw err;
      lastError = err; // try the next server
    }
  }
  throw lastError;
}

// Split raw OSM elements into POIs (for pins) and building-type counts,
// keeping only things whose point lies inside the locked view.
function parseElements(elements, bounds) {
  const pois = [];
  const counts = {};
  for (const el of elements) {
    const tags = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null || !bounds.contains([lat, lon])) continue;

    if (tags.building) counts[tags.building] = (counts[tags.building] || 0) + 1;

    const key = POI_KEYS.find((k) => tags[k]);
    if (key) {
      pois.push({
        id: `${el.type}/${el.id}`,
        lat,
        lon,
        name: tags.name || "",
        key,
        type: tags[key],
      });
    }
  }
  const buildings = Object.entries(counts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
  return { pois, buildings };
}

function groupPois(pois) {
  const groups = {};
  for (const p of pois) {
    const id = `${p.key}:${p.type}`;
    (groups[id] ||= { id, label: pretty(p.type), items: [] }).items.push(p);
  }
  return Object.values(groups).sort((a, b) => b.items.length - a.items.length);
}

// Built with DOM nodes (not HTML strings) so OSM names can never inject markup
function makePopup(p) {
  const div = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = p.name || `Unnamed ${pretty(p.type)}`;
  div.appendChild(title);
  div.appendChild(document.createElement("br"));
  div.appendChild(document.createTextNode(`${p.key}: ${pretty(p.type)}`));
  return div;
}

const pinIcon = L.divIcon({
  className: "poi-pin",
  html: "<span></span>",
  iconSize: [24, 24],
  iconAnchor: [12, 29],
  popupAnchor: [0, -29],
});

export default function Page3() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const noticeTimer = useRef(null);
  const [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState("");
  const [poi, setPoi] = useState(EMPTY_POIS);

  // Create the map once
  useEffect(() => {
    // Guard against double-initialisation (React StrictMode runs effects twice in dev)
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      minZoom: MIN_ZOOM,
      maxBounds: WORLD_BOUNDS,
      maxBoundsViscosity: 1.0, // stops dragging past the edge of the world
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      minZoom: MIN_ZOOM,
      maxZoom: 19,
      noWrap: true, // no repeating copies of the world
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapRef.current = map;

    // Make sure tiles render correctly once the layout has settled
    const timer = setTimeout(() => map.invalidateSize(), 100);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Lock / unlock zoom and movement whenever the button is toggled
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    HANDLERS.forEach((name) => {
      if (map[name]) locked ? map[name].disable() : map[name].enable();
    });

    // Hide the +/- buttons while locked so zoom can't be changed that way either
    if (map.zoomControl) {
      map.zoomControl.getContainer().style.display = locked ? "none" : "";
    }
  }, [locked]);

  // When locked: fetch POIs + buildings inside the visible borders and pin them.
  // When unlocked (or unmounted): cancel the request and remove the pins.
  useEffect(() => {
    const map = mapRef.current;
    if (!locked || !map) return;

    const controller = new AbortController();
    const layer = L.layerGroup().addTo(map);
    const bounds = map.getBounds(); // the frozen fragment

    setPoi({ ...EMPTY_POIS, status: "loading" });

    fetchOverpass(buildQuery(bounds), controller.signal)
      .then((data) => {
        const { pois, buildings } = parseElements(data.elements || [], bounds);
        const shown = pois.slice(0, MAX_PINS);
        shown.forEach((p) => {
          const marker = L.marker([p.lat, p.lon], { icon: pinIcon });
          // autoPan off: the map is locked, so a popup must never move it
          marker.bindPopup(makePopup(p), { autoPan: false });
          marker.addTo(layer);
          markersRef.current[p.id] = marker;
        });
        setPoi({ status: "done", pois: shown, total: pois.length, buildings, error: "" });
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setPoi({
          ...EMPTY_POIS,
          status: "error",
          error: "Couldn't load places. Check your connection, then unlock and lock again.",
        });
      });

    return () => {
      controller.abort();
      layer.remove();
      markersRef.current = {};
      setPoi(EMPTY_POIS);
    };
  }, [locked]);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const handleLockClick = () => {
    const map = mapRef.current;
    if (!locked && map && map.getZoom() < LOCK_MIN_ZOOM) {
      setNotice("Zoom in further before locking the map.");
      clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(""), 3500);
      return;
    }
    setNotice("");
    setLocked((v) => !v);
  };

  const buildingTotal = poi.buildings.reduce((sum, b) => sum + b.count, 0);

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

      {locked && (
        <aside className="page3-panel" aria-label="Places in this view">
          <h2>In this view</h2>

          {poi.status === "loading" && <p>Loading places…</p>}
          {poi.status === "error" && <p className="page3-panel-error">{poi.error}</p>}

          {poi.status === "done" && (
            <>
              <h3>Places ({poi.total})</h3>
              {poi.total === 0 && <p>No places are mapped in this view.</p>}
              {poi.total > poi.pois.length && (
                <p>Showing the first {MAX_PINS} places.</p>
              )}
              {groupPois(poi.pois).map((g) => (
                <details key={g.id}>
                  <summary>
                    {g.label} <span className="page3-count">{g.items.length}</span>
                  </summary>
                  <ul>
                    {g.items.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => markersRef.current[p.id]?.openPopup()}
                        >
                          {p.name || `Unnamed ${pretty(p.type)}`}
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}

              <h3>Buildings ({buildingTotal})</h3>
              {buildingTotal === 0 && <p>No buildings are mapped in this view.</p>}
              <ul className="page3-buildings">
                {poi.buildings.map((b) => (
                  <li key={b.type}>
                    <span>{b.type === "yes" ? "Type not specified" : pretty(b.type)}</span>
                    <span className="page3-count">
                      {b.count} ({Math.round((b.count / buildingTotal) * 100)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      )}

      <nav className="page3-nav" aria-label="Main">
        <a href="#/">Landing</a>
        <a href="#/page2">Page 2</a>
      </nav>
    </div>
  );
}