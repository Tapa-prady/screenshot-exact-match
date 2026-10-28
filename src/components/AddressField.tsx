import { useEffect, useRef, useState, type ComponentType } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, LoaderCircle, LocateFixed, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shortAddress } from "@/lib/address";
import { searchAddress } from "@/lib/routing.functions";
import type { Coordinates } from "@/lib/ride-matching";

export type Place = { label: string; coordinates: Coordinates };

const fieldClass =
  "h-12 w-full rounded-xl border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Address input that only reports a place once the user has confirmed a real geocoded result
 * (or the GPS position), so a typed-but-unverified address can never be submitted.
 */
export function AddressField({
  id,
  label,
  icon: Icon,
  initialText = "",
  autoPick = false,
  gps = false,
  onChange,
}: {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  initialText?: string;
  /** Look up `initialText` on mount and confirm its first result. */
  autoPick?: boolean;
  gps?: boolean;
  onChange: (place: Place | null) => void;
}) {
  const geocode = useServerFn(searchAddress);
  const [text, setText] = useState(initialText);
  const [places, setPlaces] = useState<Place[]>([]);
  const [picked, setPicked] = useState<Place | null>(null);
  const [busy, setBusy] = useState<"search" | "gps" | null>(null);
  const [error, setError] = useState("");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  function choose(place: Place | null) {
    setPicked(place);
    onChangeRef.current(place);
  }

  async function lookup(query: string, pickFirst = false) {
    seq.current++;
    clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setError("Saisissez au moins deux caractères.");
      return;
    }
    setError("");
    setBusy("search");
    setPlaces([]);
    try {
      const raw = await geocode({ data: { query } });
      // Shortened here too, so even an older server answer never shows the full postal hierarchy.
      const response = {
        ...raw,
        places: raw.places.map((place) => ({ ...place, label: shortAddress(place.label) })),
      };
      if (response.error) setError(response.error);
      else if (!response.places.length)
        setError("Aucune adresse trouvée. Précisez la rue ou le lieu.");
      const first = response.places[0];
      if (pickFirst && first) {
        setText(first.label);
        choose(first);
      } else setPlaces(response.places);
    } catch {
      setError("La recherche d’adresse est indisponible.");
    } finally {
      setBusy(null);
    }
  }

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seq = useRef(0);
  function suggest(value: string) {
    clearTimeout(timer.current);
    const mine = ++seq.current;
    if (value.trim().length < 2) {
      setPlaces([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const raw = await geocode({ data: { query: value } });
        if (mine !== seq.current) return;
        setPlaces(raw.places.map((p) => ({ ...p, label: shortAddress(p.label) })));
        setError("");
      } catch {
        /* the magnifier still works */
      }
    }, 450);
  }

  function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError("La localisation n’est pas disponible sur cet appareil.");
      return;
    }
    setBusy("gps");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const place: Place = {
          label: "Ma position actuelle",
          coordinates: [position.coords.longitude, position.coords.latitude],
        };
        setText(place.label);
        choose(place);
        setPlaces([]);
        setBusy(null);
      },
      () => {
        setError("Position introuvable. Autorisez la localisation ou saisissez votre adresse.");
        setBusy(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  useEffect(() => {
    if (autoPick && initialText) void lookup(initialText, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <label htmlFor={id} className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-primary" />
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={text}
          className={fieldClass}
          placeholder="Votre adresse"
          onChange={(event) => {
            setText(event.target.value);
            if (picked) choose(null);
            suggest(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void lookup(text);
            }
          }}
        />
        <Button
          variant="soft"
          size="icon"
          type="button"
          title="Rechercher l’adresse"
          aria-label={`Rechercher : ${label}`}
          disabled={busy !== null}
          onClick={() => lookup(text)}
        >
          {busy === "search" ? <LoaderCircle className="animate-spin" /> : <Search />}
        </Button>
      </div>
      {gps && (
        <Button
          variant="ghost"
          type="button"
          className="mt-1 w-full justify-start px-0 text-primary"
          disabled={busy !== null}
          onClick={locate}
        >
          {busy === "gps" ? <LoaderCircle className="animate-spin" /> : <LocateFixed />}Ma position
          actuelle
        </Button>
      )}
      {picked && (
        <p className="mt-2 flex items-center gap-2 text-xs text-primary" role="status">
          <Check className="size-4" />
          Adresse confirmée
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {places.length > 0 && (
        <ul className="mt-2 divide-y border-y" aria-label="Adresses trouvées">
          {places.map((place) => (
            <li key={place.label}>
              <Button
                type="button"
                variant="ghost"
                className="h-auto min-h-12 w-full justify-start whitespace-normal rounded-none px-2 py-3 text-start text-sm"
                onClick={() => {
                  seq.current++;
                  setText(place.label);
                  choose(place);
                  setPlaces([]);
                }}
              >
                {place.label}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
