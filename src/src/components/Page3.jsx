import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./page3.css";

const DEFAULT_CENTER = [40.7128, -74.006]; // [lat, lng]
const DEFAULT_ZOOM = 12;
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

export default function Page3() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const noticeTimer = useRef(null);
  const [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState("");

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

    // A circle marker avoids Leaflet's well-known broken-icon-image problem with bundlers
    L.circleMarker(DEFAULT_CENTER, {
      radius: 10,
      color: "#ffffff",
      weight: 3,
      fillColor: "#1d6fe0",
      fillOpacity: 1,
    })
      .addTo(map)
      .bindPopup("Hello from Page 3");

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
      <nav className="page3-nav" aria-label="Main">
        <a href="#/">Landing</a>
        <a href="#/page2">Page 2</a>
      </nav>
    </div>
  );
}