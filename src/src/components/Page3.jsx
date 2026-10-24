import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./page3.css";

const DEFAULT_CENTER = [40.7128, -74.006]; // [lat, lng]
const DEFAULT_ZOOM = 12;

export default function Page3() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    // Guard against double-initialisation (React StrictMode runs effects twice in dev)
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
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

  return (
    <div className="page3">
       <div ref={containerRef} className="page3-map" />
      <p>hello</p>
    </div>
  );
}