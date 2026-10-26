import { useEffect, useRef } from "react";
import type { Coordinates } from "@/lib/ride-matching";
import "leaflet/dist/leaflet.css";

type LeafletModule = typeof import("leaflet");
type Marker = import("leaflet").CircleMarker;

/** Meeting point plus the two live positions. The map is created once; markers move in place so zoom is never reset. */
export default function LiveMap({
  pickup,
  mine,
  other,
}: {
  pickup: Coordinates;
  mine: Coordinates | null;
  other: Coordinates | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const state = useRef<{
    L: LeafletModule;
    map: import("leaflet").Map;
    mine?: Marker | undefined;
    other?: Marker | undefined;
    fitted: boolean;
    dispose: () => void;
  } | null>(null);

  useEffect(() => {
    let disposed = false;
    void import("leaflet").then((L) => {
      if (disposed || !container.current) return;
      const map = L.map(container.current).setView([pickup[1], pickup[0]], 15);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      L.circleMarker([pickup[1], pickup[0]], {
        color: "#FFB020",
        fillColor: "#FFB020",
        fillOpacity: 1,
        radius: 9,
      })
        .addTo(map)
        .bindTooltip("Rendez-vous");
      const observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(container.current);
      state.current = {
        L,
        map,
        fitted: false,
        dispose: () => {
          observer.disconnect();
          map.remove();
        },
      };
      update();
    });
    return () => {
      disposed = true;
      state.current?.dispose();
      state.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup[0], pickup[1]]);

  function place(key: "mine" | "other", coords: Coordinates | null, color: string, label: string) {
    const current = state.current;
    if (!current) return;
    const marker = current[key];
    if (!coords) {
      marker?.remove();
      current[key] = undefined;
      return;
    }
    const latLng = current.L.latLng(coords[1], coords[0]);
    if (marker) marker.setLatLng(latLng);
    else
      current[key] = current.L.circleMarker(latLng, {
        color,
        fillColor: color,
        fillOpacity: 1,
        radius: 7,
      })
        .addTo(current.map)
        .bindTooltip(label);
  }

  function update() {
    const current = state.current;
    if (!current) return;
    place("mine", mine, "#0B1E3F", "Vous");
    place("other", other, "#10878C", "L’autre personne");
    if (!current.fitted && (mine || other)) {
      const points = [pickup, ...(mine ? [mine] : []), ...(other ? [other] : [])].map((point) =>
        current.L.latLng(point[1], point[0]),
      );
      current.map.fitBounds(current.L.latLngBounds(points), { padding: [30, 30], maxZoom: 17 });
      current.fitted = true;
    }
  }

  useEffect(update, [mine?.[0], mine?.[1], other?.[0], other?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div
      ref={container}
      className="isolate h-[320px] w-full bg-muted md:h-[420px]"
      aria-label="Carte du trajet en direct"
    />
  );
}
