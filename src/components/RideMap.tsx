import { useEffect, useRef } from "react";
import type { Coordinates } from "@/lib/ride-matching";
import "leaflet/dist/leaflet.css";

const NONE: Coordinates[] = [];

export default function RideMap({
  origin,
  driving = NONE,
  walking = NONE,
}: {
  origin: Coordinates | null;
  driving?: Coordinates[] | undefined;
  walking?: Coordinates[] | undefined;
}) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void import("leaflet").then((L) => {
      if (disposed || !container.current) return;
      const map = L.map(container.current).setView([35.7595, -5.834], 12);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      const color = getComputedStyle(container.current).getPropertyValue("--primary").trim();
      const navy = getComputedStyle(container.current).getPropertyValue("--navy").trim();
      const latLng = (coords: Coordinates) => L.latLng(coords[1], coords[0]);
      if (origin)
        L.circleMarker(latLng(origin), { color: navy, fillOpacity: 1, radius: 7 })
          .addTo(map)
          .bindTooltip("Votre départ");
      if (driving.length > 1) L.polyline(driving.map(latLng), { color, weight: 5 }).addTo(map);
      if (walking.length > 1)
        L.polyline(walking.map(latLng), { color: navy, weight: 4, dashArray: "4 7" }).addTo(map);
      const all = [...driving, ...walking, ...(origin ? [origin] : [])];
      if (all.length > 1)
        map.fitBounds(L.latLngBounds(all.map(latLng)), { padding: [30, 30], maxZoom: 17 });
      else if (origin) map.setView(latLng(origin), 16);
      const observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(container.current);
      cleanup = () => {
        observer.disconnect();
        map.remove();
      };
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [origin, driving, walking]);
  return (
    <div
      ref={container}
      className="isolate h-[360px] w-full bg-muted md:h-[540px]"
      aria-label="Carte des itinéraires à Tanger"
    />
  );
}
