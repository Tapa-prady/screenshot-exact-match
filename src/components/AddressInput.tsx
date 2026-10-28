import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, LoaderCircle } from "lucide-react";
import { searchAddress } from "@/lib/routing.functions";
import type { Coordinates } from "@/lib/ride-matching";

export type Place = { label: string; coordinates: Coordinates };
export const ENSA_TANGER: Place = { label: "ENSA de Tanger, Boukhalef", coordinates: [-5.8951485, 35.7370275] };
const field = "h-12 w-full rounded-xl border bg-card px-3 pe-10 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AddressInput({ id, value, place, placeholder, onText, onPick }: {
  id: string; value: string; place: Place | null; placeholder?: string;
  onText: (text: string) => void; onPick: (place: Place) => void;
}) {
  const geocode = useServerFn(searchAddress);
  const [options, setOptions] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    if (place || value.trim().length < 3) { setOptions([]); return; }
    const current = ++request.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await geocode({ data: { query: value } });
        if (current === request.current) { setOptions(response.places); setOpen(true); }
      } catch { if (current === request.current) setOptions([]); }
      finally { if (current === request.current) setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [value, place, geocode]);

  return (
    <div className="relative">
      <input id={id} value={value} placeholder={placeholder} autoComplete="off" role="combobox" aria-expanded={open && options.length > 0} aria-controls={`${id}-list`}
        className={field} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={event => onText(event.target.value)} />
      <span className="absolute end-3 top-1/2 -translate-y-1/2 text-primary">
        {loading ? <LoaderCircle className="size-4 animate-spin" /> : place ? <Check className="size-4" aria-label="Adresse confirmée" /> : null}
      </span>
      {open && options.length > 0 && !place && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-[1000] mt-1 w-full overflow-hidden rounded-xl border bg-card shadow-lg">
          {options.map(option => (
            <li key={option.label} role="option" aria-selected={false}>
              <button type="button" className="w-full px-3 py-3 text-start text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                onMouseDown={event => event.preventDefault()} onClick={() => { onPick(option); setOpen(false); }}>{option.label}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
