import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./page3.css";
import { ArrowRight, Beaker, Home, Play, Send } from "lucide-react";
import { MAPS, POINTS_BY_MAP } from "./mapsData";
import { getHeatmap, askZone } from "../api"; // adjust the path to wherever api.js lives

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

// The map box keeps one fixed shape, so a heat map built for it covers the whole box at any window size
const MAP_RATIO = 4 / 3;
const MAP_RATIO_NARROW = 1; // phones: a squarer box keeps the map big enough
const BREAKPOINT = 760;

// Fit bounds with no zoom snapping, so the area fills the box instead of stopping up to a quarter-zoom short
function fitExact(map, bounds) {
  const snap = map.options.zoomSnap;
  map.options.zoomSnap = 0;
  map.fitBounds(bounds, { animate: false });
  map.options.zoomSnap = snap;
}

// Put the map on a given map's saved view (no animation)
// Fit the map's whole area into the space available, keeping clear of the progress dots (top) and status pill (bottom)
function applyView(map, m) {
  map.invalidateSize({ animate: false });
  const narrow = map.getSize().x < 560;
  map.fitBounds(m.bounds, {
    animate: false,
    paddingTopLeft: [24, 60],
    paddingBottomRight: [24, narrow ? 84 : 64],
  });
}

// ── What Atom is told about the hotspot ───────────────────────────────────
// Mirrors WEIGHTS / LAND_CORE / LAND_TAIL / CORE_SHARE in heatmap.py. Used only to rank which
// sources pull the hotspot toward its spot (sent to Atom as context); the server's heat map stays the source of truth.
const SOURCE_WEIGHTS = {
  "PFAS Producer (firefighting foam)": 100, "Chemical Compounds Company": 85,
  "Military Airfield": 75, "Military Training Base": 75, Airbase: 75,
  Airport: 70, Landfill: 70, "Textiles Factory": 60, "Garments Manufacturer": 60,
  "Industrial Factory": 55, "Industrial Plant": 55, "Industrial Complex with Plants": 55,
  "Industrial Park": 55, "Waste Management Service": 55,
  "Wastewater Treatment Facility": 50, "Water Treatment Facility": 50, "Seaplane Base": 45,
  "Fire Station": 40, Port: 40, "Nestle Factory": 30, "Coca Cola Factory": 30,
  "Major Transport Hub": 25, "Train Station": 20, "Logging Company": 20, University: 15,
};
const DEFAULT_WEIGHT = 30;
const LAND_CORE = 1500, LAND_TAIL = 5000, CORE_SHARE = 0.5; // metres

// Rank the map's sources by how strongly each one pulls on the hotspot (heat_at's formula, per source)
function buildDrivers(points, peak) {
  if (!peak || !points?.length) return [];
  const ranked = points.map((p) => {
    const km = distanceKm(p, peak);
    const m = km * 1000;
    const weight = SOURCE_WEIGHTS[p.type] ?? DEFAULT_WEIGHT;
    const pull = weight * (CORE_SHARE * Math.exp(-((m / LAND_CORE) ** 2)) + (1 - CORE_SHARE) * Math.exp(-m / LAND_TAIL));
    return { type: p.type, km, weight, pull };
  });
  const sum = ranked.reduce((n, r) => n + r.pull, 0) || 1;
  return ranked
    .sort((a, b) => b.pull - a.pull)
    .slice(0, 6)
    .map((r) => ({ ...r, share: r.pull / sum }));
}

// Short fallback questions, only used if Atom doesn't send his own follow-ups
const AIRFIELD = "What is AFFF?";
const CHIP_BY_TYPE = {
  Airport: AIRFIELD, Airbase: AIRFIELD, "Military Airfield": AIRFIELD, "Military Training Base": AIRFIELD, "Seaplane Base": AIRFIELD, "Fire Station": AIRFIELD,
  Landfill: "How do PFAS leak out?",
  "Wastewater Treatment Facility": "Why isn't it filtered out?",
  "Water Treatment Facility": "Why isn't it filtered out?",
  "Textiles Factory": "Why PFAS in fabric?",
  "Garments Manufacturer": "Why PFAS in fabric?",
  Port: "How do ports spread it?",
};
const atomChips = (drivers) => {
  const own = [...new Set(drivers.map((d) => CHIP_BY_TYPE[d.type] ?? "How do factories release it?"))];
  return [own[0] ?? "How does PFAS spread?", own[1] ?? "How far does it travel?", "Why does it last forever?"];
};

const overall = (avg) => (avg >= 80 ? "PFAS whisperer" : avg >= 60 ? "Sharp tracker" : avg >= 40 ? "Getting warmer" : "Back to the lab");

function distanceKm(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmtKm = (km) => (km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString());
const verdict = (s) => (s >= 90 ? "Bullseye" : s >= 70 ? "Sharp eye" : s >= 40 ? "Right region" : "Cold trail");

// Counts a number up from 0 with an ease-out curve
function useCountUp(target, ms = 1300) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target == null) { setV(0); return; }
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function Mark() {
  return (
    <svg className="p3-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M7 16c0-5 3.2-8 7-8 2.9 0 4.5 2 6 4.4C21.5 14.8 23 16 25 16c0 5-3.2 8-7 8-2.9 0-4.5-2-6-4.4C10.5 17.2 9 16 7 16Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="7" cy="16" r="2.4" fill="#d4ff55" /><circle cx="25" cy="16" r="2.4" fill="#ff604f" />
    </svg>
  );
}

export default function Page3() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const zoomRef = useRef(null);
  const poiLayerRef = useRef(null); // red points with their name tags
  const guessLayerRef = useRef(null); // the guess dot
  const peakLayerRef = useRef(null); // the X marking where the 100 is
  const lockedRef = useRef(LOCKED);
  const heatBoundsRef = useRef(null); // bounds of the heat map on screen, or null
  const slotRef = useRef(null); // the grid cell the map box is centered in
  const [box, setBox] = useState(null); // { w, h } px of the fixed-shape map box
  const indexRef = useRef(0);
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
  // Atom's conversation per map: { [mapId]: { messages: [{ role: "model" | "user", text }], status: "idle" | "loading" | "error", error } }
  const [chats, setChats] = useState({});
  const [chatInput, setChatInput] = useState("");
  const chatsRef = useRef({});
  const atomEpochRef = useRef(0); // bumped on Play again so late replies from an old round are dropped
  const logRef = useRef(null);

  const current = MAPS[index];
  lockedRef.current = locked;
  indexRef.current = index;
  const submitted = !!guess?.submitted;
  const [scores, setScores] = useState({}); // { [mapId]: { score, km } } for the whole round
  const shown = useCountUp(guess?.score ?? null);
  const total = Object.values(scores).reduce((n, r) => n + r.score, 0);
  const result = scores[current.id];
  const count = Object.keys(scores).length;
  const finished = count === MAPS.length;
  const nextIdx = finished ? -1 : MAPS.map((_, k) => (index + 1 + k) % MAPS.length).find((i) => !scores[MAPS[i].id]);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryView, setSummaryView] = useState("total"); // "total" | "games"
  const [summarySeen, setSummarySeen] = useState(false);
  const finalShown = useCountUp(showSummary && summaryView === "total" ? total : null, 1600);
  const entries = MAPS.map((m) => ({ id: m.id, ...scores[m.id] }));
  const best = finished ? entries.reduce((a, b) => (b.score > a.score ? b : a)) : null;
  const worst = finished ? entries.reduce((a, b) => (b.score < a.score ? b : a)) : null;
  const avg = count ? Math.round(total / count) : 0;
  chatsRef.current = chats;
  heatBoundsRef.current = heat?.bounds ?? null;
  const chat = chats[current.id];
  const chatMsgs = chat?.messages ?? [];
  const chatStatus = chat?.status ?? "idle";
  // Tap-to-ask questions under Atom's latest message: his own teasers, or short fallbacks for his first message
  const lastMsg = chatMsgs[chatMsgs.length - 1];
  const chips = lastMsg?.role !== "model" ? [] : lastMsg.followups?.length ? lastMsg.followups : chatMsgs.length === 1 && scores[current.id] ? atomChips(scores[current.id].drivers) : [];

  // Keep the newest line of the conversation in view
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMsgs.length, chatStatus, current.id]);

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
      zoomSnap: 0.25,
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

  // Size the map box: the biggest fixed-shape rectangle that fits its cell, so it never stretches
  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const measure = () => {
      const { width: W, height: H } = el.getBoundingClientRect();
      if (!W || !H) return;
      const r = W <= BREAKPOINT ? MAP_RATIO_NARROW : MAP_RATIO;
      const w = Math.floor(Math.min(W, H * r));
      const h = Math.floor(w / r);
      setBox((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-fit whenever the map's box changes size (window resize, sidebar wrapping, first layout)
  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const ro = new ResizeObserver(() => {
      const map = mapRef.current;
      if (!map) return;
      map.invalidateSize({ animate: false });
      if (!lockedRef.current) return;
      // With a heat map showing, keep the whole heat map in view; otherwise the map's saved view
      if (heatBoundsRef.current) fitExact(map, heatBoundsRef.current);
      else applyView(map, MAPS[indexRef.current]);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [ready]);

  // When the last map is scored, let the reveal play, then show the final results
  useEffect(() => {
    if (!finished || summarySeen) return;
    const t = setTimeout(() => { setSummaryView("total"); setShowSummary(true); setSummarySeen(true); }, 2600);
    return () => clearTimeout(t);
  }, [finished, summarySeen]);

  useEffect(() => {
    if (!showSummary) return;
    const onKey = (e) => { if (e.key === "Escape") setShowSummary(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSummary]);

  // Move to the selected map's fixed view
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    applyView(map, current);
  }, [ready, index]);

  // When a heat map is showing (new reveal, or a finished map reopened), frame exactly the area it covers.
  // Declared after the effect above so it wins when both run in the same render.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !heat || !locked) return;
    map.invalidateSize({ animate: false });
    fitExact(map, heat.bounds);
  }, [ready, heat, locked]);

  // Red points: locked = only this map's, with always-visible name tags.
  // Freeroam = every point from every map around the world (name shows on hover).
  useEffect(() => {
    if (!ready || !poiLayerRef.current) return;

    poiLayerRef.current.clearLayers();
    const pts = locked ? POINTS_BY_MAP[current.id] || [] : ALL_POINTS;
    pts.forEach((p) => {
      const dot = L.circleMarker([p.lat, p.lng], {
        radius: locked ? 7 : 6,
        color: "#090a09",
        weight: 2,
        fillColor: "#ff604f",
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
        dot.bindTooltip(p.type, { direction: "top", offset: [0, -6], className: "page3-poi-tag" });
      }
      dot.addTo(poiLayerRef.current);
    });
  }, [ready, index, locked]);

  // Click the map to place or move the guess dot (only while locked and not submitted)
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

  // Draw the guess dot; draggable until submitted
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
      opacity: 0, // fades up to HEAT_OPACITY (see the transition in page3.css)
      interactive: false,
    }).addTo(map);
    const timer = setTimeout(() => overlay.setOpacity(HEAT_OPACITY), 60);
    return () => { clearTimeout(timer); overlay.remove(); };
  }, [ready, heat, locked]);

  // Mark where the 100 is with an X, as soon as the heatmap arrives
  useEffect(() => {
    if (!ready || !peakLayerRef.current) return;
    peakLayerRef.current.clearLayers();
    if (!heat || !heat.peak || !locked) return;

    // Dashed line from the guess to the answer
    if (heat.guess) {
      L.polyline([[heat.guess.lat, heat.guess.lng], [heat.peak.lat, heat.peak.lng]], {
        className: "page3-link",
        interactive: false,
      }).addTo(peakLayerRef.current);
    }

    L.marker([heat.peak.lat, heat.peak.lng], {
      keyboard: false,
      interactive: false,
      zIndexOffset: 1000,
      icon: L.divIcon({
        className: "page3-peak",
        html: '<span class="page3-peak-ring"></span><span class="page3-peak-ring r2"></span>✕',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    })
      .bindTooltip("Highest PFAS concentration", {
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

  // Ask Atom. message = null asks for his opening explanation of the zone; otherwise it is the player's follow-up.
  const talkToAtom = async (mapId, entry, message) => {
    const epoch = atomEpochRef.current;
    const prior = chatsRef.current[mapId]?.messages ?? [];
    const withUser = message ? [...prior, { role: "user", text: message }] : prior;
    setChats((p) => ({ ...p, [mapId]: { messages: withUser, status: "loading", error: "" } }));
    try {
      const res = await askZone({
        score: entry.score,
        km: entry.km,
        sources: entry.drivers.map((d) => ({ type: d.type, km: Math.round(d.km * 100) / 100, weight: d.weight })),
        message,
        history: prior.map(({ role, text }) => ({ role, text })),
      });
      if (epoch !== atomEpochRef.current) return;
      setChats((p) => ({ ...p, [mapId]: { messages: [...withUser, { role: "model", text: res.answer, followups: res.followups ?? [] }], status: "idle", error: "" } }));
    } catch (err) {
      if (epoch !== atomEpochRef.current) return;
      // Put the question back in the box so nothing is lost and history stays in valid turn order
      if (message) setChatInput(message);
      setChats((p) => ({ ...p, [mapId]: { messages: prior, status: "error", error: err.message } }));
    }
  };

  const sendToAtom = (text) => {
    const msg = text.trim();
    const entry = scores[current.id];
    if (!msg || !entry || chatStatus === "loading") return;
    setChatInput("");
    talkToAtom(current.id, entry, msg);
  };

  // Bring back a finished game's pin and heat map so it can be reviewed
  const restore = (id) => {
    const r = scores[id];
    if (!r) return;
    setGuess({ lat: r.guess.lat, lng: r.guess.lng, submitted: true, score: r.score });
    setHeat(r.heat);
  };

  // Jump to a map. Always lands on the locked, fixed view; a map you already played shows its saved result.
  const goTo = (i) => {
    resetGuess();
    setLocked(true);
    setIndex(i);
    restore(MAPS[i].id);
  };

  const playAgain = () => {
    resetGuess();
    atomEpochRef.current++;
    setChats({});
    setChatInput("");
    setScores({});
    setSummarySeen(false);
    setShowSummary(false);
    setLocked(true);
    setIndex(0);
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
      restore(current.id);
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
      const heatData = {
        rows: res.rows,
        cols: res.cols,
        values: res.values,
        peak: res.peak,
        guess: { lat: guess.lat, lng: guess.lng },
        bounds: [
          [bounds.south, bounds.west],
          [bounds.north, bounds.east],
        ],
      };
      setHeat(heatData);
      setGuess((prev) => (prev ? { ...prev, score: res.score } : prev));
      const km = res.peak ? distanceKm(guess, res.peak) : null;
      const entry = {
        score: res.score,
        km,
        guess: { lat: guess.lat, lng: guess.lng },
        heat: heatData,
        drivers: buildDrivers(POINTS_BY_MAP[current.id] || [], res.peak),
      };
      setScores((prev) => ({ ...prev, [current.id]: entry }));
      setLoading(false);
      talkToAtom(current.id, entry, null); // Atom explains the zone as soon as it is revealed
    } catch (err) {
      if (id !== reqRef.current) return;
      setGuess((prev) => (prev ? { ...prev, submitted: false } : prev)); // let them try again
      setError(err.message);
      setLoading(false);
    }
  };

  // One line telling the player what to do next
  let status = "Click the map to drop your pin where you think PFAS is highest";
  if (!locked) status = "Freeroam: pan and zoom to see every site. Hover a point for its name";
  else if (error) status = error;
  else if (loading) status = "Building the heat map";
  else if (submitted) status = "Guess submitted. The X marks the highest concentration";
  else if (guess) status = "Drag the pin to adjust, then submit your guess";

  return (
    <main className="p3">
      <header className="p3-topbar">
        <a className="p3-wordmark" href="#/"><Mark /><span>FOREVER<br /><i>GUESSER</i></span></a>

        <div className="p3-cycle">
          <button type="button" onClick={() => goTo((index - 1 + MAPS.length) % MAPS.length)} aria-label="Previous map">‹</button>
          <span className="p3-label" aria-live="polite">Map {current.id} of {MAPS.length}</span>
          <button type="button" onClick={() => goTo((index + 1) % MAPS.length)} aria-label="Next map">›</button>
        </div>

        <button
          type="button"
          className={`p3-btn p3-btn-ghost${locked ? "" : " is-freeroam"}`}
          onClick={handleModeClick}
          aria-pressed={!locked}
        >
          {locked ? "Freeroam" : "Back to round"}
        </button>

        <button
          type="button"
          className="p3-btn p3-btn-lime"
          onClick={handleSubmit}
          disabled={!locked || !guess || submitted || loading}
        >
          {loading ? "Building heat map…" : submitted ? "Guess submitted" : "Submit guess"}
        </button>
      </header>

      <section className="p3-stage">
        <aside className="p3-side" aria-label="Score and Atom">
          {locked ? (
            <>
              <div className={`p3-score${heat ? " is-scored" : ""}`} aria-live="polite">
                <div className="p3-score-row">
                  <span className="p3-eyebrow">Score</span>
                  <strong>{submitted ? (guess.score != null ? shown : "…") : "–"}</strong>
                </div>
                {heat && result ? (
                  <div className="p3-result">
                    <h3>{verdict(result.score)}</h3>
                    {result.km != null && <p>{fmtKm(result.km)} km from the hotspot</p>}
                    <div className="p3-scale-wrap">
                      <div className="p3-scale" style={{ background: LEGEND_GRADIENT }} />
                      <div className="p3-scale-ends"><span>0</span><span>100</span></div>
                      <div className="p3-scale-caption">Scaled PFAS concentration</div>
                    </div>
                    {finished ? (
                      <button type="button" className="p3-btn p3-btn-lime" onClick={() => { setSummaryView("total"); setShowSummary(true); }}>
                        Final results <ArrowRight size={14} />
                      </button>
                    ) : (
                      <button type="button" className="p3-btn p3-btn-lime" onClick={() => goTo(nextIdx)}>
                        Next map <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="p3-tip">Drop a pin where you think PFAS concentration peaks. Red points are likely sources. After you submit, Atom explains why the hotspot sits where it does.</p>
                )}
                {total > 0 && (
                  <div className="p3-total">
                    <span>Round total</span>
                    <span>{total}<small> / {MAPS.length * 100}</small></span>
                  </div>
                )}
              </div>

              {heat && result && (
                <section className="p3-atom" aria-label="Chat with Atom">
                  <div className="p3-atom-head">
                    <span className="p3-atom-dot" aria-hidden="true" />
                    <span className="p3-eyebrow">Atom</span>
                    <span className="p3-atom-sub">Ask me about this zone</span>
                  </div>

                  <div className="p3-atom-log" ref={logRef} role="log" aria-live="polite">
                    {chatMsgs.map((m, i) => (
                      <p key={i} className={`p3-msg ${m.role === "model" ? "is-atom" : "is-you"}`}>{m.text}</p>
                    ))}
                    {chatStatus === "loading" && (
                      <p className="p3-msg is-atom is-typing" role="status" aria-label="Atom is typing"><i /><i /><i /></p>
                    )}
                    {chatStatus === "error" && (
                      <div className="p3-msg is-error" role="alert">
                        <span>{chat.error || "Atom couldn't answer."}</span>
                        {chatMsgs.length === 0 && (
                          <button type="button" onClick={() => talkToAtom(current.id, result, null)}>Try again</button>
                        )}
                      </div>
                    )}
                  </div>

                  {chatStatus === "idle" && chips.length > 0 && (
                    <div className="p3-chips">
                      {chips.map((q) => (
                        <button key={q} type="button" onClick={() => sendToAtom(q)}>{q}</button>
                      ))}
                    </div>
                  )}

                  <form className="p3-ask" onSubmit={(e) => { e.preventDefault(); sendToAtom(chatInput); }}>
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      maxLength={500}
                      placeholder="Ask Atom a question"
                      aria-label="Ask Atom a question"
                      disabled={chatStatus === "loading" || chatMsgs.length === 0}
                    />
                    <button type="submit" className="p3-btn p3-btn-lime" disabled={!chatInput.trim() || chatStatus === "loading"} aria-label="Send">
                      <Send size={14} />
                    </button>
                  </form>
                </section>
              )}
            </>
          ) : (
            <p className="p3-tip">Freeroam shows every site on every map. Choose Back to round to keep playing.</p>
          )}
        </aside>

        <div className="p3-mapslot" ref={slotRef}>
        <div className="p3-mapwrap" style={box ? { width: box.w, height: box.h } : undefined}>
          <div ref={containerRef} className="p3-map" />
          {loading && <div className="p3-scanline" />}

          <div className="p3-panel p3-progress" role="group" aria-label="Maps in this round">
            {MAPS.map((m, i) => (
              <button
                key={m.id}
                type="button"
                className={`p3-tick${i === index ? " is-current" : ""}${scores[m.id] ? " is-done" : ""}`}
                onClick={() => goTo(i)}
                aria-label={`Map ${m.id}${scores[m.id] ? `, scored ${scores[m.id].score}` : ""}`}
                aria-current={i === index ? "true" : undefined}
                title={scores[m.id] ? `Map ${m.id}: ${scores[m.id].score}` : `Map ${m.id}`}
              />
            ))}
          </div>

          <div className={`p3-panel p3-status${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>
            <span className="p3-live" />
            <span>{status}</span>
          </div>
        </div>
        </div>

      </section>

      {showSummary && (
        <div className="p3-modal" role="dialog" aria-modal="true" aria-labelledby="p3-sum-title">
          <div className="p3-modal-card">
            {summaryView === "total" ? (
              <>
                <span className="p3-eyebrow">Round complete</span>
                <h2 id="p3-sum-title">{overall(avg)}</h2>
                <div className="p3-final"><strong>{finalShown}</strong><span>/ {MAPS.length * 100}</span></div>
                <dl className="p3-stats">
                  <div><dt>Average</dt><dd>{avg} per map</dd></div>
                  <div><dt>Best</dt><dd>Map {best.id}: {best.score}</dd></div>
                  <div><dt>Toughest</dt><dd>Map {worst.id}: {worst.score}</dd></div>
                </dl>
                <div className="p3-modal-actions">
                  <button type="button" autoFocus className="p3-btn p3-btn-lime" onClick={playAgain}>Play again</button>
                  <button type="button" className="p3-btn p3-btn-ghost" onClick={() => setSummaryView("games")}>View your games</button>
                </div>
              </>
            ) : (
              <>
                <span className="p3-eyebrow">Your games</span>
                <h2 id="p3-sum-title">Open any map to see your pin</h2>
                <ul className="p3-games">
                  {entries.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => { setShowSummary(false); goTo(MAPS.findIndex((m) => m.id === r.id)); }}>
                        <span>Map {r.id}</span>
                        <span className="p3-bar"><i style={{ width: `${r.score}%` }} /></span>
                        <strong>{r.score}</strong>
                        <small>{r.km != null ? `${fmtKm(r.km)} km` : ""}</small>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="p3-modal-actions">
                  <button type="button" className="p3-btn p3-btn-ghost" onClick={() => setSummaryView("total")}>Back</button>
                  <button type="button" className="p3-btn p3-btn-lime" onClick={playAgain}>Play again</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <nav className="p3-dock" aria-label="Main">
        <a href="#/"><Home size={14} /> Home</a>
        <a href="#/page2"><Beaker size={14} /> Talk with Atom</a>
        <a href="#/page3" aria-current="page"><Play size={13} fill="currentColor" /> Play Guesser</a>
      </nav>
    </main>
  );
}
