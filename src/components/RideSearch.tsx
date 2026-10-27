import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { formatInTimeZone } from "date-fns-tz";
import { ClientOnly } from "@/components/ClientOnly";
import {
  Car,
  CircleCheck,
  Clock,
  Footprints,
  GraduationCap,
  LocateFixed,
  MapPin,
  Search,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoleChooser } from "@/components/RoleChooser";
import { SiteHeader } from "@/components/SiteHeader";
import { searchAddress, searchRealRides } from "@/lib/routing.functions";
import { bookRide } from "@/lib/trips.functions";
import { supabase } from "@/integrations/supabase/client";
import type { Coordinates } from "@/lib/ride-matching";

const RideMap = lazy(() => import("./RideMap"));
type Place = { label: string; coordinates: Coordinates };
type Results = Awaited<ReturnType<typeof searchRealRides>>;
const fieldClass =
  "h-12 w-full rounded-xl border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function RideSearch() {
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [originText, setOriginText] = useState("");
  const [destinationText, setDestinationText] = useState("ENSA Tanger");
  const [date, setDate] = useState("");
  const [arrival, setArrival] = useState("08:30");
  const [places, setPlaces] = useState<Place[]>([]);
  const [target, setTarget] = useState<"origin" | "destination">("origin");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [selected, setSelected] = useState("");
  const geocode = useServerFn(searchAddress);
  const search = useServerFn(searchRealRides);
  const book = useServerFn(bookRide);
  const [booked, setBooked] = useState<{ priceDh: number; pickupTime: number } | null>(null);
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDate(formatInTimeZone(tomorrow, "Africa/Casablanca", "yyyy-MM-dd"));
  }, []);

  async function locate() {
    setError("");
    setBusy("gps");
    setResults(null);
    if (!navigator.geolocation) {
      setError("La localisation n’est pas disponible sur cet appareil.");
      setBusy(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const place: Place = {
          label: "Ma position actuelle",
          coordinates: [position.coords.longitude, position.coords.latitude],
        };
        setOrigin(place);
        setOriginText(place.label);
        setBusy(null);
      },
      () => {
        setError("Position introuvable. Autorisez la localisation ou saisissez votre adresse.");
        setBusy(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
  async function lookup(which: "origin" | "destination") {
    const query = which === "origin" ? originText : destinationText;
    if (query.trim().length < 3) {
      setError("Saisissez au moins trois caractères.");
      return;
    }
    setError("");
    setBusy(which);
    setTarget(which);
    setPlaces([]);
    setResults(null);
    try {
      const response = await geocode({ data: { query } });
      setPlaces(response.places);
      if (response.error) setError(response.error);
      else if (!response.places.length)
        setError("Aucune adresse trouvée. Précisez la rue ou le lieu.");
    } catch {
      setError("La recherche d’adresse est indisponible.");
    } finally {
      setBusy(null);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setResults(null);
    setBooked(null);
    if (!origin || !destination) {
      setError("Choisissez votre départ et confirmez l’adresse d’arrivée.");
      return;
    }
    setBusy("rides");
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) {
        setError("Connectez-vous avec votre adresse @etu.uae.ac.ma pour voir les conducteurs.");
        return;
      }
      const response = await search({
        data: { origin: origin.coordinates, destination: destination.coordinates, date, arrival },
      });
      setResults(response);
      setSelected(response.matches[0]?.tripId ?? "");
      if (response.error) setError(response.error);
    } catch {
      setError("La recherche n’a pas abouti. Réessayez dans un instant.");
    } finally {
      setBusy(null);
    }
  }
  const active = results?.matches.find((match) => match.tripId === selected);
  async function reserve() {
    if (!origin || !active) return;
    setError("");
    setBusy("book");
    try {
      const response = await book({
        data: { tripId: active.tripId, date, arrival, origin: origin.coordinates },
      });
      if (response.ok) setBooked({ priceDh: response.priceDh, pickupTime: response.pickupTime });
      else setError(response.error);
    } catch {
      setError("La réservation n’a pas abouti. Réessayez dans un instant.");
    } finally {
      setBusy(null);
    }
  }
  const driving = results?.routes.find((route) => route.id === selected)?.coordinates;
  return (
    <main className="min-h-screen">
      <SiteHeader
        onSignOut={() => {
          setResults(null);
          setBooked(null);
        }}
      />
      <RoleChooser />
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div id="recherche">
          <h2 className="font-display text-2xl font-bold">Où allez-vous ?</h2>
          <form onSubmit={submit} className="mt-6 space-y-5">
            <div>
              <label
                htmlFor="departure"
                className="mb-2 flex items-center gap-2 text-sm font-semibold"
              >
                <MapPin className="size-4 text-primary" />
                Départ
              </label>
              <div className="flex gap-2">
                <input
                  id="departure"
                  value={originText}
                  placeholder="Votre adresse"
                  className={fieldClass}
                  onChange={(event) => {
                    setOriginText(event.target.value);
                    setOrigin(null);
                    setResults(null);
                  }}
                />
                <Button
                  variant="soft"
                  size="icon"
                  type="button"
                  title="Rechercher le départ"
                  aria-label="Rechercher le départ"
                  disabled={busy !== null}
                  onClick={() => lookup("origin")}
                >
                  <Search />
                </Button>
              </div>
              <Button
                variant="ghost"
                type="button"
                className="mt-1 w-full justify-start px-0 text-primary"
                disabled={busy !== null}
                onClick={locate}
              >
                {busy === "gps" ? <LoaderCircle className="animate-spin" /> : <LocateFixed />}
                <span>Ma position actuelle</span>
              </Button>
            </div>
            <div>
              <label
                htmlFor="destination"
                className="mb-2 flex items-center gap-2 text-sm font-semibold"
              >
                <GraduationCap className="size-4 text-primary" />
                Arrivée
              </label>
              <div className="flex gap-2">
                <input
                  id="destination"
                  value={destinationText}
                  className={fieldClass}
                  onChange={(event) => {
                    setDestinationText(event.target.value);
                    setDestination(null);
                    setResults(null);
                  }}
                />
                <Button
                  variant="soft"
                  size="icon"
                  type="button"
                  title="Rechercher l’arrivée"
                  aria-label="Rechercher l’arrivée"
                  disabled={busy !== null}
                  onClick={() => lookup("destination")}
                >
                  <Search />
                </Button>
              </div>
            </div>
            {places.length > 0 && (
              <ul className="divide-y border-y" aria-label="Adresses trouvées">
                {places.map((place) => (
                  <li key={place.label}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto min-h-12 w-full justify-start whitespace-normal rounded-none px-2 py-3 text-start text-sm"
                      onClick={() => {
                        if (target === "origin") {
                          setOrigin(place);
                          setOriginText(place.label);
                        } else {
                          setDestination(place);
                          setDestinationText(place.label);
                        }
                        setPlaces([]);
                      }}
                    >
                      {place.label}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="travel-date" className="mb-2 block text-sm font-semibold">
                  Date
                </label>
                <input
                  id="travel-date"
                  type="date"
                  required
                  suppressHydrationWarning
                  className={fieldClass}
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setResults(null);
                  }}
                />
              </div>
              <div>
                <label htmlFor="arrival-time" className="mb-2 block text-sm font-semibold">
                  Arriver avant
                </label>
                <input
                  id="arrival-time"
                  type="time"
                  required
                  suppressHydrationWarning
                  className={fieldClass}
                  value={arrival}
                  onChange={(event) => {
                    setArrival(event.target.value);
                    setResults(null);
                  }}
                />
              </div>
            </div>
            <Button variant="cta" className="w-full" disabled={busy !== null} type="submit">
              {busy === "rides" ? <LoaderCircle className="animate-spin" /> : <Search />}
              {busy === "rides" ? "Recherche…" : "Trouver un trajet"}
            </Button>
          </form>
          {error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          )}
          {results && !results.error && (
            <section className="mt-7" aria-live="polite">
              <h3 className="text-lg font-bold">
                {results.matches.length} trajet{results.matches.length !== 1 ? "s" : ""}
              </h3>
              {results.matches.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {results.hint ?? "Aucun rendez-vous confirmé à 200 m maximum pour cette arrivée."}
                </p>
              )}
              {results.unavailableCount > 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Certains itinéraires n’ont pas pu être vérifiés.
                </p>
              )}
              <div className="mt-3 space-y-3">
                {results.matches.map((match, index) => (
                  <Button
                    key={match.tripId}
                    variant="outline"
                    className={`h-auto w-full flex-col items-start gap-3 whitespace-normal p-4 ${selected === match.tripId ? "border-primary bg-accent" : ""}`}
                    onClick={() => setSelected(match.tripId)}
                  >
                    <span className="flex w-full justify-between">
                      <span className="flex items-center gap-2">
                        <Car />
                        {results.drivers[match.tripId]?.firstName ?? `Trajet ${index + 1}`}
                        {results.drivers[match.tripId]?.rating ? (
                          <span className="text-xs font-normal text-muted-foreground">
                            ★ {results.drivers[match.tripId]?.rating.toFixed(1)}
                          </span>
                        ) : null}
                      </span>
                      <b>{match.priceDh} DH</b>
                    </span>
                    <span className="flex flex-wrap gap-3 text-xs">
                      <span className="flex items-center gap-1">
                        <Footprints />
                        {Math.ceil(match.walkingRoute.distanceMeters)} m
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock />
                        RDV {formatInTimeZone(match.pickupTime, "Africa/Casablanca", "HH:mm")}
                      </span>
                    </span>
                    <span className="text-xs">
                      Arrivée {formatInTimeZone(match.arrivalTime, "Africa/Casablanca", "HH:mm")}
                      {results.drivers[match.tripId]?.vehicle
                        ? ` · ${results.drivers[match.tripId]?.vehicle}`
                        : ""}
                    </span>
                  </Button>
                ))}
              </div>
              {active && !booked && (
                <Button
                  variant="cta"
                  className="mt-4 w-full"
                  disabled={busy !== null}
                  onClick={reserve}
                >
                  {busy === "book" ? <LoaderCircle className="animate-spin" /> : <CircleCheck />}
                  {busy === "book" ? "Réservation…" : `Réserver ma place · ${active.priceDh} DH`}
                </Button>
              )}
              {booked && (
                <div
                  role="status"
                  className="mt-4 space-y-2 rounded-2xl border border-primary bg-accent p-4 text-sm"
                >
                  <p className="flex items-center gap-2 font-bold text-primary">
                    <CircleCheck className="size-5" />
                    Place réservée · {booked.priceDh} DH
                  </p>
                  <p>
                    Rendez-vous à{" "}
                    {formatInTimeZone(booked.pickupTime, "Africa/Casablanca", "HH:mm")} au point
                    indiqué en pointillés sur la carte.
                  </p>
                  <Button asChild variant="link" className="h-auto px-0">
                    <Link to="/mes-trajets">Voir mes trajets</Link>
                  </Button>
                </div>
              )}
            </section>
          )}
        </div>
        <section aria-label="Itinéraire" className="min-w-0">
          <ClientOnly fallback={<div className="h-[360px] bg-muted md:h-[540px]" />}>
            <Suspense fallback={<div className="h-[360px] bg-muted md:h-[540px]" />}>
              <RideMap
                origin={origin?.coordinates ?? null}
                driving={driving}
                walking={active?.walkingRoute.coordinates}
              />
            </Suspense>
          </ClientOnly>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b py-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Footprints className="size-4 text-primary" />
              RDV à 200 m maximum
            </span>
            <a
              className="text-primary underline"
              href="https://www.openstreetmap.org/fixthemap"
              target="_blank"
              rel="noreferrer"
            >
              Corriger la carte
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
