import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Car, LoaderCircle, LocateFixed, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publishTrip, searchAddress } from "@/lib/routing.functions";
import { supabase } from "@/integrations/supabase/client";
import { calculateRidePrice } from "@/lib/ride-pricing";
import type { Coordinates } from "@/lib/ride-matching";

export const Route = createFileRoute("/_authenticated/publier")({
  head: () => ({ meta: [
    { title: "Publier un trajet — Rafiq" },
    { name: "description", content: "Proposez votre trajet vers l’ENSA Tanger aux étudiants sur votre itinéraire." },
    { property: "og:title", content: "Publier un trajet — Rafiq" },
    { property: "og:description", content: "Conducteurs : partagez vos places vers l’ENSA Tanger." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PublishPage,
});

type Place = { label: string; coordinates: Coordinates };
type Trip = { id: string; origin_label: string; dest_label: string; departure_time: string; one_off_date: string | null; weekdays: number[]; seats: number; route_km: number; active: boolean };
const field = "h-12 w-full rounded-xl border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function PublishPage() {
  const geocode = useServerFn(searchAddress);
  const publish = useServerFn(publishTrip);
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [originText, setOriginText] = useState("");
  const [destText, setDestText] = useState("ENSA Tanger");
  const [places, setPlaces] = useState<Place[]>([]);
  const [target, setTarget] = useState<"o" | "d">("o");
  const [recurring, setRecurring] = useState(true);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("07:45");
  const [seats, setSeats] = useState(3);
  const [vehicle, setVehicle] = useState({ brand: "", color: "", plate: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [trips, setTrips] = useState<Trip[]>([]);

  async function loadTrips() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data } = await supabase.from("trips").select("id,origin_label,dest_label,departure_time,one_off_date,weekdays,seats,route_km,active").eq("driver_id", u.user.id).order("created_at", { ascending: false });
    setTrips(data ?? []);
  }
  useEffect(() => { loadTrips(); }, []);

  async function lookup(which: "o" | "d") {
    const query = which === "o" ? originText : destText;
    if (query.trim().length < 3) { setMessage("Saisissez au moins trois caractères."); return; }
    setBusy(which); setTarget(which); setMessage("");
    try { const r = await geocode({ data: { query } }); setPlaces(r.places); if (r.error) setMessage(r.error); else if (!r.places.length) setMessage("Aucune adresse trouvée."); }
    catch { setMessage("La recherche d’adresse est indisponible."); } finally { setBusy(null); }
  }
  function locate() {
    if (!navigator.geolocation) { setMessage("Localisation indisponible."); return; }
    setBusy("gps");
    navigator.geolocation.getCurrentPosition(p => { const pl = { label: "Ma position actuelle", coordinates: [p.coords.longitude, p.coords.latitude] as Coordinates }; setOrigin(pl); setOriginText(pl.label); setBusy(null); },
      () => { setMessage("Position introuvable."); setBusy(null); }, { enableHighAccuracy: true, timeout: 15000 });
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); setMessage("");
    if (!origin || !destination) { setMessage("Confirmez le départ et l’arrivée avec la loupe."); return; }
    setBusy("pub");
    try {
      const r = await publish({ data: { origin, destination, departureTime: time, oneOffDate: recurring ? null : date, weekdays, seats, vehicle } });
      if (r.error) setMessage(r.error);
      else { setMessage(`Trajet publié : ${r.km} km, ${r.minutes} min. Prix passager max ${calculateRidePrice(r.km ?? 0)} DH.`); loadTrips(); }
    } catch { setMessage("La publication a échoué. Réessayez."); } finally { setBusy(null); }
  }
  async function toggle(trip: Trip) {
    await supabase.from("trips").update({ active: !trip.active }).eq("id", trip.id);
    loadTrips();
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 py-6">
      <Button asChild variant="ghost" size="sm" className="px-0"><Link to="/"><ArrowLeft />Retour</Link></Button>
      <h1 className="mt-2 font-display text-2xl font-bold">Publier un trajet</h1>
      <form onSubmit={submit} className="mt-6 space-y-5">
        <div>
          <label htmlFor="o" className="mb-2 block text-sm font-semibold">Départ</label>
          <div className="flex gap-2"><input id="o" className={field} value={originText} placeholder="Votre adresse" onChange={e => { setOriginText(e.target.value); setOrigin(null); }} /><Button type="button" variant="soft" size="icon" aria-label="Rechercher le départ" disabled={busy !== null} onClick={() => lookup("o")}><Search /></Button></div>
          <Button type="button" variant="ghost" className="mt-1 px-0 text-primary" disabled={busy !== null} onClick={locate}>{busy === "gps" ? <LoaderCircle className="animate-spin" /> : <LocateFixed />}Ma position actuelle</Button>
        </div>
        <div>
          <label htmlFor="d" className="mb-2 block text-sm font-semibold">Arrivée</label>
          <div className="flex gap-2"><input id="d" className={field} value={destText} onChange={e => { setDestText(e.target.value); setDestination(null); }} /><Button type="button" variant="soft" size="icon" aria-label="Rechercher l’arrivée" disabled={busy !== null} onClick={() => lookup("d")}><Search /></Button></div>
        </div>
        {places.length > 0 && <ul className="divide-y border-y">{places.map(p => <li key={p.label}><Button type="button" variant="ghost" className="h-auto w-full justify-start whitespace-normal rounded-none py-3 text-start text-sm" onClick={() => { if (target === "o") { setOrigin(p); setOriginText(p.label); } else { setDestination(p); setDestText(p.label); } setPlaces([]); }}>{p.label}</Button></li>)}</ul>}
        <div className="flex gap-2">
          <Button type="button" variant={recurring ? "default" : "outline"} onClick={() => setRecurring(true)}>Chaque semaine</Button>
          <Button type="button" variant={!recurring ? "default" : "outline"} onClick={() => setRecurring(false)}>Une seule fois</Button>
        </div>
        {recurring ? <div className="flex flex-wrap gap-2">{DAYS.map((d, i) => { const n = i + 1; const on = weekdays.includes(n); return <Button key={d} type="button" size="sm" variant={on ? "default" : "outline"} aria-pressed={on} onClick={() => setWeekdays(on ? weekdays.filter(x => x !== n) : [...weekdays, n])}>{d}</Button>; })}</div>
          : <div><label htmlFor="date" className="mb-2 block text-sm font-semibold">Date</label><input id="date" type="date" required className={field} value={date} onChange={e => setDate(e.target.value)} /></div>}
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="t" className="mb-2 block text-sm font-semibold">Heure de départ</label><input id="t" type="time" required className={field} value={time} onChange={e => setTime(e.target.value)} /></div>
          <div><label htmlFor="s" className="mb-2 block text-sm font-semibold">Places</label><input id="s" type="number" min={1} max={6} required className={field} value={seats} onChange={e => setSeats(Number(e.target.value))} /></div>
        </div>
        <fieldset className="grid grid-cols-3 gap-3">
          <legend className="mb-2 flex items-center gap-2 text-sm font-semibold"><Car className="size-4 text-primary" />Véhicule</legend>
          <input aria-label="Marque" placeholder="Marque" required className={field} value={vehicle.brand} onChange={e => setVehicle({ ...vehicle, brand: e.target.value })} />
          <input aria-label="Couleur" placeholder="Couleur" required className={field} value={vehicle.color} onChange={e => setVehicle({ ...vehicle, color: e.target.value })} />
          <input aria-label="Plaque" placeholder="Plaque" required className={field} value={vehicle.plate} onChange={e => setVehicle({ ...vehicle, plate: e.target.value })} />
        </fieldset>
        <Button variant="cta" type="submit" className="w-full" disabled={busy !== null}>{busy === "pub" ? <LoaderCircle className="animate-spin" /> : null}{busy === "pub" ? "Calcul de l’itinéraire…" : "Publier le trajet"}</Button>
      </form>
      {message && <p role="status" className="mt-4 text-sm">{message}</p>}
      <section className="mt-8">
        <h2 className="text-lg font-bold">Mes trajets</h2>
        {trips.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Aucun trajet publié.</p>}
        <ul className="mt-3 space-y-3">{trips.map(t => <li key={t.id} className="rounded-xl border p-4 text-sm">
          <p className="font-semibold">{t.departure_time.slice(0, 5)} · {t.one_off_date ?? t.weekdays.map(n => DAYS[n - 1]).join(" ")}</p>
          <p className="mt-1 line-clamp-1 text-muted-foreground">{t.origin_label} → {t.dest_label}</p>
          <p className="mt-1">{t.route_km} km · {t.seats} places</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => toggle(t)}>{t.active ? "Mettre en pause" : "Réactiver"}</Button>
        </li>)}</ul>
      </section>
    </main>
  );
}
