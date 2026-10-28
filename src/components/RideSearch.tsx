import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { ClientOnly, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { formatInTimeZone } from "date-fns-tz";
import { Car, Clock, Footprints, GraduationCap, LocateFixed, MapPin, Search, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { searchRealRides } from "@/lib/routing.functions";
import { AddressInput, ENSA_TANGER, type Place } from "./AddressInput";
import { supabase } from "@/integrations/supabase/client";
import type { Coordinates } from "@/lib/ride-matching";
import logo from "@/assets/rafiq_logo.png.asset.json";

const RideMap = lazy(() => import("./RideMap"));
type Results = Awaited<ReturnType<typeof searchRealRides>>;
const fieldClass = "h-12 w-full rounded-xl border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function RideSearch() {
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(ENSA_TANGER);
  const [originText, setOriginText] = useState("");
  const [destinationText, setDestinationText] = useState(ENSA_TANGER.label);
  const [date, setDate] = useState("");
  const [arrival, setArrival] = useState("08:30");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [selected, setSelected] = useState("");
  const search = useServerFn(searchRealRides);
  const [account, setAccount] = useState<string | null>(null);
  useEffect(() => {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    setDate(formatInTimeZone(tomorrow, "Africa/Casablanca", "yyyy-MM-dd"));
    const show = (email?: string | null) => setAccount(email ? (email.split("@")[0] ?? null) : null);
    supabase.auth.getSession().then(({ data }) => show(data.session?.user.email));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => show(session?.user.email));
    return () => data.subscription.unsubscribe();
  }, []);
  async function signOut() { await supabase.auth.signOut(); setResults(null); }

  async function locate() {
    setError(""); setBusy("gps"); setResults(null);
    if (!navigator.geolocation) { setError("La localisation n’est pas disponible sur cet appareil."); setBusy(null); return; }
    navigator.geolocation.getCurrentPosition(position => {
      const place: Place = { label: "Ma position actuelle", coordinates: [position.coords.longitude, position.coords.latitude] };
      setOrigin(place); setOriginText(place.label); setBusy(null);
    }, () => { setError("Position introuvable. Autorisez la localisation ou saisissez votre adresse."); setBusy(null); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setResults(null);
    if (!origin || !destination) { setError("Choisissez votre départ dans les suggestions."); return; }
    setBusy("rides");
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) { setError("Connectez-vous avec votre adresse @etu.uae.ac.ma pour voir les conducteurs."); return; }
      const response = await search({ data: { origin: origin.coordinates, destination: destination.coordinates, date, arrival } });
      setResults(response); setSelected(response.matches[0]?.tripId ?? "");
      if (response.error) setError(response.error);
    } catch { setError("La recherche n’a pas abouti. Réessayez dans un instant."); }
    finally { setBusy(null); }
  }
  const active = results?.matches.find(match => match.tripId === selected);
  const driving = results?.routes.find(route => route.id === selected)?.coordinates;
  return (
    <main className="min-h-screen">
      <header className="border-b bg-card px-5 py-5">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <img src={logo.url} alt="" className="size-12 rounded-xl" />
          <h1 className="font-display text-2xl font-bold">Rafiq</h1>
          <span className="ms-auto hidden items-center gap-2 text-sm text-primary sm:flex"><GraduationCap className="size-5" /><span>ENSA Tanger</span></span>
          {account && <Button asChild variant="cta" size="sm" className="ms-auto sm:ms-0"><Link to="/publier">Publier</Link></Button>}{account ? <Button variant="outline" size="sm" onClick={signOut}>{account} · Déconnexion</Button> : <Button asChild variant="soft" size="sm" className="ms-auto sm:ms-0"><Link to="/auth">Connexion</Link></Button>}
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div>
          <h2 className="font-display text-2xl font-bold">Où allez-vous ?</h2>
          <form onSubmit={submit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="departure" className="mb-2 flex items-center gap-2 text-sm font-semibold"><MapPin className="size-4 text-primary" />Départ</label>
              <AddressInput id="departure" value={originText} place={origin} placeholder="Tapez votre quartier, ex. Mesnana" onText={text => { setOriginText(text); setOrigin(null); setResults(null); }} onPick={place => { setOrigin(place); setOriginText(place.label); setResults(null); }} />
              <Button variant="ghost" type="button" className="mt-1 w-full justify-start px-0 text-primary" disabled={busy !== null} onClick={locate}>{busy === "gps" ? <LoaderCircle className="animate-spin" /> : <LocateFixed />}Ma position actuelle</Button>
            </div>
            <div>
              <label htmlFor="destination" className="mb-2 flex items-center gap-2 text-sm font-semibold"><GraduationCap className="size-4 text-primary" />Arrivée</label>
              <AddressInput id="destination" value={destinationText} place={destination} onText={text => { setDestinationText(text); setDestination(null); setResults(null); }} onPick={place => { setDestination(place); setDestinationText(place.label); setResults(null); }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label htmlFor="travel-date" className="mb-2 block text-sm font-semibold">Date</label><input id="travel-date" type="date" required className={fieldClass} value={date} onChange={event => { setDate(event.target.value); setResults(null); }} /></div>
              <div><label htmlFor="arrival-time" className="mb-2 block text-sm font-semibold">Arriver avant</label><input id="arrival-time" type="time" required className={fieldClass} value={arrival} onChange={event => { setArrival(event.target.value); setResults(null); }} /></div>
            </div>
            <Button variant="cta" className="w-full" disabled={busy !== null} type="submit">{busy === "rides" ? <LoaderCircle className="animate-spin" /> : <Search />}{busy === "rides" ? "Recherche…" : "Trouver un trajet"}</Button>
          </form>
          {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
          {results && !results.error && <section className="mt-7" aria-live="polite">
            <h3 className="text-lg font-bold">{results.matches.length} trajet{results.matches.length !== 1 ? "s" : ""}</h3>
            {results.matches.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Aucun rendez-vous confirmé à 200 m maximum pour cette arrivée.</p>}
            {results.unavailableCount > 0 && <p className="mt-2 text-sm text-muted-foreground">Certains itinéraires n’ont pas pu être vérifiés.</p>}
            <div className="mt-3 space-y-3">{results.matches.map((match, index) => <Button key={match.tripId} variant="outline" className={`h-auto w-full flex-col items-start gap-3 whitespace-normal p-4 ${selected === match.tripId ? "border-primary bg-accent" : ""}`} onClick={() => setSelected(match.tripId)}>
              <span className="flex w-full justify-between"><span className="flex items-center gap-2"><Car />Trajet {index + 1}</span><b>{match.priceDh} DH</b></span>
              <span className="flex flex-wrap gap-3 text-xs"><span className="flex items-center gap-1"><Footprints />{Math.ceil(match.walkingRoute.distanceMeters)} m</span><span className="flex items-center gap-1"><Clock />RDV {formatInTimeZone(match.pickupTime, "Africa/Casablanca", "HH:mm")}</span></span>
              <span className="text-xs">Arrivée {formatInTimeZone(match.arrivalTime, "Africa/Casablanca", "HH:mm")}</span>
            </Button>)}</div>
          </section>}
        </div>
        <section aria-label="Itinéraire" className="min-w-0">
          <ClientOnly fallback={<div className="h-[360px] bg-muted md:h-[540px]" />}><Suspense fallback={<div className="h-[360px] bg-muted md:h-[540px]" />}><RideMap origin={origin?.coordinates ?? null} driving={driving} walking={active?.walkingRoute.coordinates} /></Suspense></ClientOnly>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b py-4 text-sm text-muted-foreground"><span className="flex items-center gap-2"><Footprints className="size-4 text-primary" />RDV à 200 m maximum</span><a className="text-primary underline" href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Corriger la carte</a></div>
        </section>
      </div>
    </main>
  );
}