import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./page3.css";
import "./page3-pfas.css";

const DEFAULT_CENTER = [40.7128, -74.006]; // [lat, lng]
const DEFAULT_ZOOM = 15;
const MIN_ZOOM = 3;
const WORLD_BOUNDS = [
  [-85, -180],
  [85, 180],
];

// The map can only be locked inside this zoom window, so every round covers a
// playable area: big enough to hold several sources, small enough to judge.
const LOCK_MIN_ZOOM = 15; // zoomed out further than this = too big an area
const LOCK_MAX_ZOOM = 16; // zoomed in further than this = too little to guess from
const MIN_SOURCES = 2; // a round needs at least this many places to be a real guess

// Every Leaflet interaction that moves or zooms the map
const HANDLERS = [
  "dragging",
  "touchZoom",
  "doubleClickZoom",
  "scrollWheelZoom",
  "boxZoom",
  "keyboard",
];

// ---------------------------------------------------------------------------
// PFAS-related source types (OpenStreetMap tags).
//   weight : 0-1, how strong a source this is at distance 0
//   radius : metres, how far the influence reaches (gaussian falloff)
// These numbers are ASSUMPTIONS for a screening-level estimate.
// ---------------------------------------------------------------------------
const SOURCE_TYPES = [
  { id: "airport", label: "Airport / airfield", key: "aeroway", value: "aerodrome", weight: 0.8, radius: 1200, why: "AFFF firefighting foam / fire training" },
  { id: "military", label: "Military site", key: "military", value: null, weight: 0.9, radius: 1500, why: "AFFF use and fire training areas" },
  { id: "landfill", label: "Landfill", key: "landuse", value: "landfill", weight: 0.85, radius: 1200, why: "Leachate from PFAS-containing waste" },
  { id: "wastewater", label: "Wastewater plant", key: "man_made", value: "wastewater_plant", weight: 0.75, radius: 1000, why: "Biosolids and effluent" },
  { id: "works", label: "Industrial works", key: "man_made", value: "works", weight: 0.7, radius: 700, why: "Manufacturing / metal finishing" },
  { id: "industrial", label: "Industrial land", key: "landuse", value: "industrial", weight: 0.55, radius: 600, why: "Possible PFAS-using processes" },
  { id: "fire", label: "Fire station", key: "amenity", value: "fire_station", weight: 0.45, radius: 500, why: "Foam storage and training" },
  { id: "dryclean", label: "Dry cleaner", key: "shop", value: "dry_cleaning", weight: 0.4, radius: 300, why: "Stain / water-repellent treatments" },
  { id: "fuel", label: "Fuel station", key: "amenity", value: "fuel", weight: 0.3, radius: 300, why: "Fuel spill response, minor source" },
  { id: "carwash", label: "Car wash", key: "amenity", value: "car_wash", weight: 0.3, radius: 250, why: "Wax / water-repellent products" },
  { id: "carpet", label: "Carpet / textile shop", key: "shop", value: "carpet", weight: 0.25, radius: 200, why: "Stain-resistant coatings" },
];

const GRID = 96; // heat map resolution (cells per side)
const EXPLAIN_URL = "/api/pfas-explain"; // see pfas-server.mjs

const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// ---- geometry helpers (small-area equirectangular approximation) ----
const M_PER_DEG_LAT = 111320;
const mPerDegLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

function distMeters(lat1, lon1, lat2, lon2) {
  const dy = (lat1 - lat2) * M_PER_DEG_LAT;
  const dx = (lon1 - lon2) * mPerDegLon((lat1 + lat2) / 2);
  return Math.hypot(dx, dy);
}

// ---- Overpass ----
function buildQuery(b) {
  const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
  const parts = SOURCE_TYPES.map((t) => {
    const sel = t.value ? `["${t.key}"="${t.value}"]` : `["${t.key}"]`;
    return `nwr${sel}(${bbox});`;
  }).join("");
  return `[out:json][timeout:25];(${parts});out center tags;`;
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
      lastError = err;
    }
  }
  throw lastError;
}

function classify(tags) {
  return SOURCE_TYPES.find((t) => tags[t.key] && (!t.value || tags[t.key] === t.value));
}

// Only places inside the locked frame count: what the player sees is what scores.
function parseElements(elements, bounds) {
  const out = [];
  const seen = new Set();
  for (const el of elements) {
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const tags = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const type = classify(tags);
    if (lat == null || lon == null || !type || !bounds.contains([lat, lon])) continue;
    out.push({ id, lat, lon, name: tags.name || "", type });
  }
  return out;
}

// ---- Risk model ----
// Each source contributes w * exp(-(d/r)^2). Contributions combine as
// independent probabilities (noisy-OR): many weak sources add up, never past 100%.
const contribution = (s, d) => s.type.weight * Math.exp(-((d / s.type.radius) ** 2));

function scoreAt(lat, lon, sources) {
  let miss = 1;
  for (const s of sources) {
    miss *= 1 - contribution(s, distMeters(lat, lon, s.lat, s.lon));
  }
  return 1 - miss;
}

function rankSources(lat, lon, sources) {
  return sources
    .map((s) => {
      const d = distMeters(lat, lon, s.lat, s.lon);
      return { s, d, c: contribution(s, d) };
    })
    .sort((a, b) => b.c - a.c);
}

// Score every cell of the frame once; also find the true hotspot.
function computeGrid(bounds, sources) {
  const values = new Float32Array(GRID * GRID);
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();
  let max = 0;
  let peak = bounds.getCenter();

  for (let y = 0; y < GRID; y++) {
    const lat = north - ((y + 0.5) / GRID) * (north - south);
    for (let x = 0; x < GRID; x++) {
      const lon = west + ((x + 0.5) / GRID) * (east - west);
      const p = scoreAt(lat, lon, sources);
      values[y * GRID + x] = p;
      if (p > max) {
        max = p;
        peak = L.latLng(lat, lon);
      }
    }
  }
  return { values, max, peak };
}

// 0 -> transparent, then green -> yellow -> orange -> red -> purple
const RAMP = [
  [0.0, [46, 160, 67]],
  [0.25, [250, 204, 21]],
  [0.5, [249, 115, 22]],
  [0.75, [220, 38, 38]],
  [1.0, [126, 34, 206]],
];

function colorAt(p) {
  for (let i = 1; i < RAMP.length; i++) {
    if (p <= RAMP[i][0]) {
      const [p0, c0] = RAMP[i - 1];
      const [p1, c1] = RAMP[i];
      const t = (p - p0) / (p1 - p0);
      return c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
    }
  }
  return RAMP[RAMP.length - 1][1];
}

// Paint the grid to a small canvas; the browser smooths it when the overlay is
// stretched across the map, which gives the soft heat-map look.
function gridToDataUrl(values) {
  const canvas = document.createElement("canvas");
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(GRID, GRID);
  for (let i = 0; i < values.length; i++) {
    const p = values[i];
    const o = i * 4;
    if (p < 0.03) continue; // stays transparent
    const [r, g, b] = colorAt(p);
    img.data[o] = r;
    img.data[o + 1] = g;
    img.data[o + 2] = b;
    img.data[o + 3] = Math.round(255 * (0.2 + 0.5 * p));
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

// ---- Explanations ----
async function fetchExplanation(payload, signal) {
  const res = await fetch(EXPLAIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new Error(`Explain endpoint returned ${res.status}`);
  const json = await res.json();
  if (typeof json.explanation !== "string" || !json.explanation) throw new Error("Empty explanation");
  return json.explanation;
}

// Used when the AI endpoint is not running or fails, so the game still works.
function localExplain(pct, contributors, nearest) {
  if (!contributors.length) {
    return nearest
      ? `No strong sources are close to this spot. The nearest PFAS-related place is a ${nearest.type.toLowerCase()} about ${nearest.distanceM} m away, which is too far to add much.`
      : "No PFAS-related places are mapped near this spot, so the estimate is very low.";
  }
  const [top, ...rest] = contributors;
  let text = `The biggest driver here is a ${top.type.toLowerCase()} ${top.distanceM} m away (${top.why.toLowerCase()}).`;
  if (rest.length) {
    text += ` ${rest.length} more source${rest.length > 1 ? "s" : ""} nearby add${rest.length > 1 ? "" : "s"} to it, which is why the total reaches ${pct}%.`;
  }
  return text;
}

// ---- Popups and tooltips (DOM nodes so OSM names can never inject markup) ----
function makeExplainPopup(pct, text, note) {
  const div = document.createElement("div");
  div.className = "pfas-popup";
  const title = document.createElement("strong");
  title.textContent = `Estimated PFAS likelihood: ${pct}%`;
  const p = document.createElement("p");
  p.textContent = text;
  div.append(title, p);
  if (note) {
    const small = document.createElement("small");
    small.textContent = note;
    div.appendChild(small);
  }
  return div;
}

function makeTooltip(s) {
  const span = document.createElement("span");
  span.textContent = s.name ? `${s.name} (${s.type.label})` : s.type.label;
  return span;
}

const pinIcon = L.divIcon({
  className: "poi-pin",
  html: "<span></span>",
  iconSize: [24, 24],
  iconAnchor: [12, 29],
  popupAnchor: [0, -29],
});

const guessIcon = L.divIcon({
  className: "guess-pin",
  html: "<span></span>",
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const peakIcon = L.divIcon({
  className: "peak-pin",
  html: "<span>★</span>",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function verdict(accuracy) {
  if (accuracy >= 90) return "Spot on";
  if (accuracy >= 60) return "Close";
  if (accuracy >= 30) return "In the neighborhood";
  return "Off target";
}

export default function Page3() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const noticeTimer = useRef(null);

  // Round state kept in refs so map event handlers never read stale values
  const phaseRef = useRef("idle");
  const layerRef = useRef(null); // everything drawn for the current round
  const boundsRef = useRef(null); // the frozen frame
  const sourcesRef = useRef([]);
  const guessRef = useRef(null);
  const guessMarkerRef = useRef(null);
  const explainAbort = useRef(null);

  const [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | loading | sparse | error | guessing | revealed
  const [sourceCount, setSourceCount] = useState(0);
  const [hasGuess, setHasGuess] = useState(false);
  const [result, setResult] = useState(null);

  const go = (p) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // Create the map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      minZoom: MIN_ZOOM,
      maxBounds: WORLD_BOUNDS,
      maxBoundsViscosity: 1.0,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      minZoom: MIN_ZOOM,
      maxZoom: 19,
      noWrap: true,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapRef.current = map;
    const timer = setTimeout(() => map.invalidateSize(), 100);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Lock / unlock zoom and movement
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    HANDLERS.forEach((name) => {
      if (map[name]) locked ? map[name].disable() : map[name].enable();
    });

    if (map.zoomControl) {
      map.zoomControl.getContainer().style.display = locked ? "none" : "";
    }
  }, [locked]);

  // Round setup: runs on lock, undone on unlock.
  useEffect(() => {
    const map = mapRef.current;
    if (!locked || !map) return;

    const controller = new AbortController();
    const layer = L.layerGroup().addTo(map);
    const bounds = map.getBounds(); // the frozen frame
    layerRef.current = layer;
    boundsRef.current = bounds;
    let onClick = null;

    go("loading");

    fetchOverpass(buildQuery(bounds), controller.signal)
      .then((json) => {
        const sources = parseElements(json.elements || [], bounds);
        sourcesRef.current = sources;
        setSourceCount(sources.length);

        if (sources.length < MIN_SOURCES) {
          go("sparse");
          return;
        }

        // Pins only: the heat map stays hidden until the player guesses.
        // bubblingMouseEvents lets a click on a pin still place a guess.
        sources.forEach((s) => {
          L.marker([s.lat, s.lon], { icon: pinIcon, bubblingMouseEvents: true })
            .bindTooltip(makeTooltip(s))
            .addTo(layer);
        });

        onClick = (e) => {
          if (!bounds.contains(e.latlng)) return;
          if (phaseRef.current === "guessing") placeGuess(e.latlng);
          else if (phaseRef.current === "revealed") explainAt(e.latlng);
        };
        map.on("click", onClick);

        go("guessing");
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        go("error");
      });

    return () => {
      controller.abort();
      explainAbort.current?.abort();
      if (onClick) map.off("click", onClick);
      map.closePopup();
      layer.remove();
      layerRef.current = null;
      boundsRef.current = null;
      sourcesRef.current = [];
      guessRef.current = null;
      guessMarkerRef.current = null;
      go("idle");
      setSourceCount(0);
      setHasGuess(false);
      setResult(null);
    };
  }, [locked]);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  // ---- Guess phase ----
  function placeGuess(latlng) {
    guessRef.current = latlng;
    if (guessMarkerRef.current) {
      guessMarkerRef.current.setLatLng(latlng);
    } else {
      guessMarkerRef.current = L.marker(latlng, { icon: guessIcon, interactive: false }).addTo(layerRef.current);
    }
    setHasGuess(true);
  }

  // ---- Reveal ----
  function handleReveal() {
    const layer = layerRef.current;
    const guess = guessRef.current;
    const bounds = boundsRef.current;
    const sources = sourcesRef.current;
    if (!layer || !guess || !bounds || phaseRef.current !== "guessing") return;

    const grid = computeGrid(bounds, sources);
    L.imageOverlay(gridToDataUrl(grid.values), bounds, {
      interactive: false,
      className: "page3-heat",
    }).addTo(layer);
    L.marker(grid.peak, { icon: peakIcon, interactive: false }).addTo(layer);

    const guessPct = scoreAt(guess.lat, guess.lng, sources);
    const counts = {};
    sources.forEach((s) => {
      counts[s.type.id] = (counts[s.type.id] || 0) + 1;
    });

    setResult({
      guessPct: Math.round(guessPct * 100),
      peakPct: Math.round(grid.max * 100),
      distance: Math.round(distMeters(guess.lat, guess.lng, grid.peak.lat, grid.peak.lng)),
      accuracy: Math.round((guessPct / grid.max) * 100),
      byType: SOURCE_TYPES.filter((t) => counts[t.id]).map((t) => ({ type: t, count: counts[t.id] })),
    });
    go("revealed");
  }

  // ---- Explain phase: click anywhere on the revealed map ----
  function explainAt(latlng) {
    const map = mapRef.current;
    const sources = sourcesRef.current;
    if (!map) return;

    const ranked = rankSources(latlng.lat, latlng.lng, sources);
    const pct = Math.round(scoreAt(latlng.lat, latlng.lng, sources) * 100);
    const contributors = ranked
      .filter((x) => x.c > 0.02)
      .slice(0, 5)
      .map(({ s, d, c }) => ({
        name: s.name,
        type: s.type.label,
        why: s.type.why,
        distanceM: Math.round(d),
        contributionPct: Math.round(c * 100),
      }));
    const nearest = ranked.length
      ? [...ranked].sort((a, b) => a.d - b.d)[0]
      : null;
    const nearestInfo = nearest
      ? { type: nearest.s.type.label, distanceM: Math.round(nearest.d) }
      : null;

    const popup = L.popup({ autoPan: false })
      .setLatLng(latlng)
      .setContent(makeExplainPopup(pct, "Asking the AI why…"))
      .openOn(map);

    explainAbort.current?.abort();
    const controller = new AbortController();
    explainAbort.current = controller;

    fetchExplanation(
      { lat: latlng.lat, lon: latlng.lng, percent: pct, contributors, nearest: nearestInfo },
      controller.signal
    )
      .then((text) => popup.setContent(makeExplainPopup(pct, text, "AI explanation of a modeled estimate")))
      .catch((err) => {
        if (err.name === "AbortError") return;
        popup.setContent(
          makeExplainPopup(pct, localExplain(pct, contributors, nearestInfo), "Basic explanation (AI service not reachable)")
        );
      });
  }

  const handleLockClick = () => {
    const map = mapRef.current;
    if (!locked && map) {
      const z = map.getZoom();
      let msg = "";
      if (z < LOCK_MIN_ZOOM) msg = "Zoom in a little more: that's too big an area to guess in.";
      else if (z > LOCK_MAX_ZOOM) msg = "Zoom out a little: that's too small an area to guess in.";
      if (msg) {
        setNotice(msg);
        clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(""), 3500);
        return;
      }
    }
    setNotice("");
    setLocked((v) => !v);
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

      {locked && (
        <aside className="page3-panel" aria-label="PFAS guessing game">
          <h2>Where is PFAS highest?</h2>

          {phase === "loading" && <p>Finding possible PFAS sources…</p>}

          {phase === "error" && (
            <p className="page3-panel-error">
              Couldn't load places. Check your connection, then unlock and lock again.
            </p>
          )}

          {phase === "sparse" && (
            <>
              <p>
                Only {sourceCount} PFAS-related place{sourceCount === 1 ? "" : "s"} here, which isn't
                enough for a fair guess. Unlock and try an area with industry, an airport or a landfill.
              </p>
              <button type="button" className="pfas-btn" onClick={() => setLocked(false)}>
                Try another area
              </button>
            </>
          )}

          {phase === "guessing" && (
            <>
              <p>
                {sourceCount} possible sources are pinned. Hover a pin to see what it is. Only places
                inside this frame count.
              </p>
              <p>
                <strong>Click the map where you think the PFAS concentration is highest.</strong> You
                can move your guess before submitting.
              </p>
              <button type="button" className="pfas-btn" disabled={!hasGuess} onClick={handleReveal}>
                {hasGuess ? "Submit guess" : "Drop a guess first"}
              </button>
            </>
          )}

          {phase === "revealed" && result && (
            <>
              <p className="pfas-verdict">
                {verdict(result.accuracy)} · {result.accuracy}% accuracy
              </p>
              <ul className="pfas-stats">
                <li>
                  Your guess <span>{result.guessPct}%</span>
                </li>
                <li>
                  Hotspot ★ <span>{result.peakPct}%</span>
                </li>
                <li>
                  Distance to hotspot <span>{result.distance} m</span>
                </li>
              </ul>

              <div className="pfas-legend">
                <div className="pfas-legend-bar" />
                <div className="pfas-legend-labels">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
                <p className="pfas-legend-note">
                  Modeled likelihood index, not measured PFAS. <strong>Click anywhere</strong> on the
                  map for an AI explanation of that spot's number.
                </p>
              </div>

              <h3>Sources in this frame</h3>
              <ul className="pfas-types">
                {result.byType.map(({ type, count }) => (
                  <li key={type.id}>
                    <span>
                      {type.label}
                      <small>{type.why}</small>
                    </span>
                    <span className="page3-count">{count}</span>
                  </li>
                ))}
              </ul>

              <button type="button" className="pfas-btn" onClick={() => setLocked(false)}>
                New round
              </button>
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
