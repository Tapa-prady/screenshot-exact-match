import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Car, CircleCheck, GraduationCap, LoaderCircle, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddressField, type Place } from "@/components/AddressField";
import { RoleSwitch } from "@/components/RoleSwitch";
import { SiteHeader } from "@/components/SiteHeader";
import { useAccount } from "@/hooks/use-account";
import { supabase } from "@/integrations/supabase/client";
import { calculateRidePrice } from "@/lib/ride-pricing";
import { publishTrip } from "@/lib/trips.functions";

export const Route = createFileRoute("/_authenticated/publier")({
  head: () => ({
    meta: [
      { title: "Publier un trajet — Rafiq" },
      {
        name: "description",
        content:
          "Proposez vos places libres aux étudiants de l'ENSA Tanger et partagez vos frais d'essence.",
      },
      { property: "og:title", content: "Publier un trajet — Rafiq" },
      {
        property: "og:description",
        content: "Proposez un trajet récurrent en moins de 30 secondes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublishPage,
});

const DAYS = [
  ["Lun", 1],
  ["Mar", 2],
  ["Mer", 3],
  ["Jeu", 4],
  ["Ven", 5],
  ["Sam", 6],
  ["Dim", 7],
] as const;
const fieldClass =
  "h-12 w-full rounded-xl border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function PublishPage() {
  const account = useAccount();
  const publish = useServerFn(publishTrip);
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [time, setTime] = useState("07:30");
  const [once, setOnce] = useState(false);
  const [date, setDate] = useState("");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [seats, setSeats] = useState(3);
  const [vehicle, setVehicle] = useState({ brand: "", color: "", plate: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ routeKm: number; routeMinutes: number } | null>(null);

  // Reuse the driver's last car so a recurring driver only types it once.
  useEffect(() => {
    if (!account.userId) return;
    void supabase
      .from("vehicles")
      .select("brand, color, plate")
      .eq("owner_id", account.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setVehicle((current) => (current.plate ? current : data));
      });
  }, [account.userId]);

  function toggleDay(day: number) {
    setDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort(),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!origin || !destination) {
      setError("Confirmez votre adresse de départ et d’arrivée avec la loupe.");
      return;
    }
    if (once && !date) {
      setError("Choisissez la date du trajet.");
      return;
    }
    if (!once && days.length === 0) {
      setError("Choisissez au moins un jour.");
      return;
    }
    setBusy(true);
    try {
      const result = await publish({
        data: {
          origin,
          destination,
          departureTime: time,
          weekdays: once ? [] : days,
          oneOffDate: once ? date : null,
          seats,
          vehicle,
        },
      });
      if (result.ok) setDone({ routeKm: result.routeKm, routeMinutes: result.routeMinutes });
      else setError(result.error);
    } catch {
      setError("La publication n’a pas abouti. Réessayez dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-xl px-5 py-8">
        <h2 className="font-display text-2xl font-bold">Proposer un trajet</h2>
        <div className="mt-3">
          <RoleSwitch needs="driver" />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Vous partagez vos frais d’essence : le prix est calculé automatiquement, entre 5 et 20 DH
          par passager.
        </p>
        {!account.ready && (
          <p className="mt-6 text-sm text-muted-foreground" role="status">
            Chargement…
          </p>
        )}
        {account.ready && !account.email && (
          <p className="mt-6 text-sm">
            Connectez-vous avec votre adresse étudiante pour publier un trajet.{" "}
            <Button asChild variant="link" className="px-1">
              <Link to="/auth">Connexion</Link>
            </Button>
          </p>
        )}
        {account.email && done && (
          <section className="mt-6 space-y-4 rounded-2xl border bg-card p-5" aria-live="polite">
            <p className="flex items-center gap-2 text-lg font-bold text-primary">
              <CircleCheck className="size-6" />
              Trajet publié
            </p>
            <p className="text-sm">
              {done.routeKm.toLocaleString("fr-FR")} km · environ {done.routeMinutes} min. Une
              passagère qui fait tout le trajet paiera {calculateRidePrice(done.routeKm)} DH.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="cta">
                <Link to="/mes-trajets">Voir mes trajets</Link>
              </Button>
              <Button variant="outline" onClick={() => setDone(null)}>
                Publier un autre trajet
              </Button>
            </div>
          </section>
        )}
        {account.email && !done && (
          <form onSubmit={submit} className="mt-6 space-y-5">
            <AddressField id="pub-origin" label="Départ" icon={MapPin} gps onChange={setOrigin} />
            <AddressField
              id="pub-destination"
              label="Arrivée"
              icon={GraduationCap}
              initialText="ENSA Tanger"
              autoPick
              onChange={setDestination}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pub-time" className="mb-2 block text-sm font-semibold">
                  Heure de départ
                </label>
                <input
                  id="pub-time"
                  type="time"
                  required
                  className={fieldClass}
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="pub-seats" className="mb-2 block text-sm font-semibold">
                  Places libres
                </label>
                <select
                  id="pub-seats"
                  className={fieldClass}
                  value={seats}
                  onChange={(event) => setSeats(Number(event.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <fieldset>
              <legend className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Car className="size-4 text-primary" />
                Votre véhicule
              </legend>
              <div className="grid grid-cols-3 gap-2">
                <input
                  aria-label="Marque"
                  placeholder="Marque"
                  required
                  className={fieldClass}
                  value={vehicle.brand}
                  onChange={(event) => setVehicle({ ...vehicle, brand: event.target.value })}
                />
                <input
                  aria-label="Couleur"
                  placeholder="Couleur"
                  required
                  className={fieldClass}
                  value={vehicle.color}
                  onChange={(event) => setVehicle({ ...vehicle, color: event.target.value })}
                />
                <input
                  aria-label="Plaque d’immatriculation"
                  placeholder="Plaque"
                  required
                  className={fieldClass}
                  value={vehicle.plate}
                  onChange={(event) => setVehicle({ ...vehicle, plate: event.target.value })}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Les passagers voient la marque et la couleur ; la plaque n’est montrée qu’après
                réservation.
              </p>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Fréquence</legend>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={once ? "outline" : "default"}
                  aria-pressed={!once}
                  onClick={() => setOnce(false)}
                >
                  Chaque semaine
                </Button>
                <Button
                  type="button"
                  variant={once ? "default" : "outline"}
                  aria-pressed={once}
                  onClick={() => setOnce(true)}
                >
                  Une seule fois
                </Button>
              </div>
              {once ? (
                <div className="mt-3">
                  <label htmlFor="pub-date" className="mb-2 block text-sm font-semibold">
                    Date
                  </label>
                  <input
                    id="pub-date"
                    type="date"
                    required
                    className={fieldClass}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </div>
              ) : (
                <div
                  className="mt-3 flex flex-wrap gap-2"
                  role="group"
                  aria-label="Jours de la semaine"
                >
                  {DAYS.map(([name, value]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={days.includes(value) ? "default" : "outline"}
                      aria-pressed={days.includes(value)}
                      onClick={() => toggleDay(value)}
                    >
                      {name}
                    </Button>
                  ))}
                </div>
              )}
            </fieldset>
            <Button variant="cta" className="w-full" type="submit" disabled={busy}>
              {busy && <LoaderCircle className="animate-spin" />}
              {busy ? "Vérification de l’itinéraire…" : "Publier mon trajet"}
            </Button>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              L’itinéraire vient de services communautaires gratuits : la publication peut prendre
              quelques secondes.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
