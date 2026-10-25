import { useState } from "react";
import { Car } from "lucide-react";
import { calculateRidePrice } from "@/lib/ride-pricing";

export function PriceCalculator() {
  const [distance, setDistance] = useState("15");
  const value = Number(distance);
  const valid = distance !== "" && Number.isFinite(value) && value >= 0;
  return (
    <section className="mx-auto mt-10 max-w-6xl px-6" aria-labelledby="price-heading">
      <div className="flex flex-wrap items-end gap-6 border-y py-6">
        <div className="flex-1">
          <h2 id="price-heading" className="flex items-center gap-2 text-xl font-bold"><Car className="size-5 text-primary" />Prix du trajet</h2>
          <label htmlFor="ride-distance" className="mt-4 block text-sm font-semibold">Distance en voiture (km)</label>
          <input id="ride-distance" type="number" min="0" step="0.1" value={distance} onChange={event => setDistance(event.target.value)} className="mt-2 h-12 w-40 rounded-xl border bg-card px-4 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <output htmlFor="ride-distance" aria-live="polite" className="font-display text-3xl font-bold text-primary">{valid ? `${calculateRidePrice(value)} DH` : "—"}</output>
      </div>
    </section>
  );
}