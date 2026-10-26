import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ClientOnly, Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CircleCheck, LoaderCircle, MapPin, MessageCircle, Phone, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { useAccount } from "@/hooks/use-account";
import { supabase } from "@/integrations/supabase/client";
import type { Coordinates } from "@/lib/ride-matching";
import { EMERGENCY_NUMBERS, positionMessage, smsHref, whatsappHref } from "@/lib/trip-share";

const LiveMap = lazy(() => import("@/components/LiveMap"));

export const Route = createFileRoute("/trajet/$bookingId")({
  head: () => ({
    meta: [
      { title: "Voyager — Rafiq" },
      { name: "description", content: "Suivez votre covoiturage en direct et prévenez vos proches en cas de besoin." },
      { property: "og:title", content: "Voyager — Rafiq" },
      { property: "og:description", content: "Suivi en direct et bouton SOS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TripLivePage,
});

const SEND_INTERVAL_MS = 10_000;
type Latest = { lat: number; lng: number } | null;

function TripLivePage() {
  const { bookingId } = Route.useParams();
  const account = useAccount();
  const userId = account.userId;
  const [mine, setMine] = useState<Coordinates | null>(null);
  const [other, setOther] = useState<Coordinates | null>(null);
  const [sharing, setSharing] = useState(false);
  const [sos, setSos] = useState<"idle" | "confirm" | "busy" | "sent">("idle");
  const [alertPosition, setAlertPosition] = useState<Latest>(null);
  const [error, setError] = useState("");
  const latest = useRef<Latest>(null);
  const lastSent = useRef(0);

  const booking = useQuery({
    queryKey: ["booking", bookingId], enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error: failure } = await supabase.from("bookings")
        .select("id, travel_date, pickup_lat, pickup_lng, pickup_eta, status, passenger_id, trips(origin_label, dest_label, driver_id)")
        .eq("id", bookingId).maybeSingle();
      if (failure) throw failure;
      return data;
    },
  });
  const contacts = useQuery({
    queryKey: ["contacts", userId], enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error: failure } = await supabase.from("trusted_contacts").select("id, name, phone").eq("owner_id", userId as string).order("created_at");
      if (failure) throw failure;
      return data ?? [];
    },
  });
  const me = useQuery({
    queryKey: ["first-name", userId], enabled: Boolean(userId),
    queryFn: async () => (await supabase.from("profiles").select("first_name").eq("id", userId as string).maybeSingle()).data?.first_name ?? "",
  });

  // Last known position of the other person, then live inserts through Realtime (row-level security still applies).
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void supabase.from("trip_positions").select("user_id, lat, lng").eq("booking_id", bookingId).order("created_at", { ascending: false }).limit(20).then(({ data }) => {
      if (!active) return;
      const theirs = data?.find(row => row.user_id !== userId);
      if (theirs) setOther([theirs.lng, theirs.lat]);
    });
    const channel = supabase.channel(`booking-${bookingId}`).on("postgres_changes",
      { event: "INSERT", schema: "public", table: "trip_positions", filter: `booking_id=eq.${bookingId}` },
      payload => {
        const row = payload.new as { user_id: string; lat: number; lng: number };
        if (row.user_id !== userId) setOther([row.lng, row.lat]);
      }).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [bookingId, userId]);

  // Position sharing is an explicit, reversible choice: nothing is sent until the button is pressed.
  useEffect(() => {
    if (!sharing || !userId) return;
    if (!navigator.geolocation) { setError("La localisation n’est pas disponible sur cet appareil."); setSharing(false); return; }
    const watch = navigator.geolocation.watchPosition(position => {
      const { latitude: lat, longitude: lng } = position.coords;
      latest.current = { lat, lng };
      setMine([lng, lat]);
      if (Date.now() - lastSent.current < SEND_INTERVAL_MS) return;
      lastSent.current = Date.now();
      void supabase.from("trip_positions").insert({ booking_id: bookingId, user_id: userId, lat, lng }).then(({ error: failure }) => {
        if (failure) { setError("Votre position n’a pas pu être partagée."); setSharing(false); }
      });
    }, () => { setError("Position introuvable. Autorisez la localisation dans votre navigateur."); setSharing(false); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(watch);
  }, [sharing, userId, bookingId]);

  function currentPosition(): Promise<Latest> {
    if (latest.current) return Promise.resolve(latest.current);
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        () => resolve(null), { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 });
    });
  }

  async function sendAlert() {
    if (!userId) return;
    setSos("busy"); setError("");
    const position = await currentPosition();
    const { error: failure } = await supabase.from("sos_events").insert({ user_id: userId, booking_id: bookingId, lat: position?.lat ?? null, lng: position?.lng ?? null });
    setAlertPosition(position);
    // Even if saving fails, the numbers and links below must still be shown: the person may be in danger.
    if (failure) setError("L’alerte n’a pas pu être enregistrée, mais vous pouvez appeler et prévenir vos proches ci-dessous.");
    setSos("sent");
  }

  const data = booking.data;
  const pickup: Coordinates | null = data ? [data.pickup_lng, data.pickup_lat] : null;
  const active = data && (data.status === "confirmed" || data.status === "in_progress");
  const firstName = me.data ?? "";
  const alerted = sos === "sent";
  const message = positionMessage({ firstName, position: alerted ? alertPosition : latest.current, alert: alerted });

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-3xl space-y-6 px-5 py-8">
        <h2 className="font-display text-2xl font-bold">Voyager</h2>
        {!account.ready && <p className="text-sm text-muted-foreground" role="status">Chargement…</p>}
        {account.ready && !account.email && <p className="text-sm">Connectez-vous pour suivre votre trajet. <Button asChild variant="link" className="px-1"><Link to="/auth">Connexion</Link></Button></p>}
        {booking.isError && <p role="alert" className="text-sm text-destructive">Ce trajet n’a pas pu être chargé. Actualisez la page.</p>}
        {booking.isSuccess && !data && <p role="alert" className="text-sm">Réservation introuvable. <Button asChild variant="link" className="px-1"><Link to="/mes-trajets">Mes trajets</Link></Button></p>}
        {data && pickup && (
          <>
            <section className="rounded-2xl border bg-card p-4 text-sm" aria-label="Résumé du trajet">
              <p className="font-semibold capitalize">{format(parseISO(data.travel_date), "EEEE d MMMM", { locale: fr })} · RDV {(data.pickup_eta ?? "").slice(0, 5)}</p>
              {data.trips && <p className="mt-1 flex items-center gap-2 text-muted-foreground"><MapPin className="size-4 text-primary" />{data.trips.origin_label.split(",")[0]} → {data.trips.dest_label.split(",")[0]}</p>}
              {!active && <p className="mt-2 text-destructive">Cette réservation n’est plus active.</p>}
            </section>

            <ClientOnly fallback={<div className="h-[320px] bg-muted md:h-[420px]" />}>
              <Suspense fallback={<div className="h-[320px] bg-muted md:h-[420px]" />}><LiveMap pickup={pickup} mine={mine} other={other} /></Suspense>
            </ClientOnly>
            <p className="text-xs text-muted-foreground">{other ? "Position de l’autre personne affichée en turquoise." : "L’autre personne n’a pas encore partagé sa position."} Point orange : rendez-vous.</p>

            {active && <Button variant={sharing ? "outline" : "cta"} className="w-full" aria-pressed={sharing} onClick={() => { setError(""); setSharing(value => !value); }}>
              {sharing ? "Arrêter de partager ma position" : "Partager ma position"}
            </Button>}
            {sharing && <p className="text-xs text-muted-foreground" role="status">Votre position est envoyée toutes les 10 secondes à l’autre personne de ce trajet, et seulement à elle.</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

            <section aria-labelledby="close-title" className="space-y-3 rounded-2xl border bg-card p-4">
              <h3 id="close-title" className="font-bold">{alerted ? "Prévenez vos proches maintenant" : "Prévenir un proche"}</h3>
              {contacts.data && contacts.data.length === 0 && <p className="text-sm text-muted-foreground">Aucun proche enregistré. <Button asChild variant="link" className="h-auto px-1"><Link to="/mes-trajets">Ajouter un proche</Link></Button></p>}
              <ul className="space-y-2">{contacts.data?.map(contact => (
                <li key={contact.id} className="flex flex-wrap items-center gap-2">
                  <span className="me-auto text-sm font-semibold">{contact.name}</span>
                  <Button asChild size="sm" variant="outline"><a href={smsHref(contact.phone, message)}><MessageCircle />SMS</a></Button>
                  <Button asChild size="sm" variant="outline"><a href={whatsappHref(contact.phone, message)} target="_blank" rel="noreferrer">WhatsApp</a></Button>
                  <Button asChild size="sm" variant="outline"><a href={`tel:${contact.phone}`} aria-label={`Appeler ${contact.name}`}><Phone />Appeler</a></Button>
                </li>
              ))}</ul>
            </section>

            <section aria-labelledby="sos-title" className="space-y-3 rounded-2xl border border-destructive/40 bg-card p-4">
              <h3 id="sos-title" className="font-bold">Besoin d’aide ?</h3>
              {sos === "idle" && <Button variant="sos" size="lg" className="w-full" onClick={() => setSos("confirm")}><ShieldAlert className="!size-5" />SOS</Button>}
              {sos === "confirm" && (
                <div className="space-y-2" role="alertdialog" aria-label="Confirmer l’alerte">
                  <p className="text-sm">Enregistrer une alerte avec votre position actuelle ?</p>
                  <div className="grid grid-cols-2 gap-2"><Button variant="sos" onClick={sendAlert}>Oui, alerter</Button><Button variant="outline" onClick={() => setSos("idle")}>Annuler</Button></div>
                </div>
              )}
              {sos === "busy" && <p className="flex items-center gap-2 text-sm" role="status"><LoaderCircle className="animate-spin" />Recherche de votre position…</p>}
              {sos === "sent" && <p className="flex items-center gap-2 font-semibold text-primary" role="status"><CircleCheck className="size-5" />Alerte enregistrée{alertPosition ? " avec votre position" : " (position introuvable)"}.</p>}
              <p className="text-xs text-muted-foreground">Rafiq n’envoie pas de message à votre place : utilisez les boutons ci-dessus pour prévenir vos proches, et appelez les secours si vous êtes en danger.</p>
              <div className="flex flex-wrap gap-2">{EMERGENCY_NUMBERS.map(item => <Button asChild key={item.number} size="sm" variant="outline"><a href={`tel:${item.number}`}><Phone />{item.label} · {item.number}</a></Button>)}</div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
