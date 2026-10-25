import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./page3.css";
import { MAPS, POINTS_BY_MAP } from "./mapsData";

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
  const [ready, setReady] = useState(false); // true once the Leaflet map exists
  const [locked, setLocked] = useState(LOCKED);
  const [index, setIndex] = useState(0);
  // The current guess: { lat, lng, submitted, score } or null. Forgotten on map change or freeroam.
  const [guess, setGuess] = useState(null);

  const current = MAPS[index];
  const submitted = !!guess?.submitted;

  // Create the map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      minZoom: MIN_ZOOM,
      maxBounds: WORLD_BOUNDS,
      maxBoundsViscosity: 1.0,
      zoomControl: false,
    });

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
      setReady(false);
    };
  }, []);

  // Move to the selected map and draw its red points with always-visible name tags
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    applyView(map, current);

    poiLayerRef.current.clearLayers();
    (POINTS_BY_MAP[current.id] || []).forEach((p) => {
      L.circleMarker([p.lat, p.lng], {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: "#d93025",
        fillOpacity: 1,
        interactive: false, // clicks pass through, so you can guess right on top of a point
      })
        .bindTooltip(p.type, {
          permanent: true,
          direction: "top",
          offset: [0, -8],
          className: "page3-poi-tag",
        })
        .addTo(poiLayerRef.current);
    });
  }, [ready, index]);

  // Click the map to place or move the blue guess dot (until it is submitted)
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || submitted || !locked) return;

    const onClick = (e) => {
      const { lat, lng } = e.latlng;
      setGuess({ lat, lng, submitted: false, score: null });
    };
    map.on("click", onClick);
    return () => map.off("click", onClick);
  }, [ready, index, submitted, locked]);

  // Draw the blue guess dot for this map; draggable until submitted
  useEffect(() => {
    if (!ready || !guessLayerRef.current) return;
    guessLayerRef.current.clearLayers();
    if (!guess || !locked) return; // hidden while in freeroam

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
  // Changing maps always lands on the locked, fixed view and forgets the guess
  const go = (delta) => {
    setGuess(null);
    setLocked(true);
    setIndex((i) => (i + delta + MAPS.length) % MAPS.length);
  };

  const handleModeClick = () => {
    const map = mapRef.current;
    if (!map) return;
    if (locked) {
      // Entering freeroam forgets the guess and score
      setGuess(null);
      setLocked(false);
    } else {
      // Locking snaps back to this map's fixed fragment
      applyView(map, current);
      setLocked(true);
    }
  };

  const handleSubmit = () => {
    if (!locked || !guess || submitted) return;
    const score = Math.floor(Math.random() * 101); // random 0-100 for now
    setGuess((prev) => ({ ...prev, submitted: true, score }));
  };

  return (
    <div className="page3">
      <div ref={containerRef} className="page3-map" />

      {locked && (
        <div className="page3-score" aria-live="polite">
          <span>Score</span>
          <strong>{submitted ? guess.score : "–"}</strong>
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
          disabled={!locked || !guess || submitted}
        >
          {submitted ? "GUESS SUBMITTED" : "SUBMIT GUESS"}
        </button>
      </div>

      <nav className="page3-nav" aria-label="Main">
        <a href="#/">Landing</a>
        <a href="#/page2">Page 2</a>
      </nav>
    </div>
  );
}