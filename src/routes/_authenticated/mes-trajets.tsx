import { RoleStatus } from "@/components/RoleSwitch";
import { shortAddress } from "@/lib/address";
import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import { Car, Clock, Footprints, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { useAccount } from "@/hooks/use-account";
import { supabase } from "@/integrations/supabase/client";
import { normalizeMoroccanPhone } from "@/lib/trip-share";

export const Route = createFileRoute("/_authenticated/mes-trajets")({
  head: () => ({
    meta: [
      { title: "Mes trajets — Rafiq" },
      {
        name: "description",
        content: "Retrouvez vos réservations et les trajets que vous proposez sur Rafiq.",
      },
      { property: "og:title", content: "Mes trajets — Rafiq" },
      { property: "og:description", content: "Vos réservations et vos trajets publiés." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyTripsPage,
});

const STATUS: Record<string, string> = {
  confirmed: "Confirmée",
  cancelled: "Annulée",
  in_progress: "En cours",
  completed: "Terminée",
};
const WEEKDAYS = ["", "lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const dayLabel = (date: string) => format(parseISO(date), "EEEE d MMMM", { locale: fr });
const clock = (time: string | null) => (time ?? "").slice(0, 5);
const shortLabel = (label: string) => shortAddress(label).split(",")[0] ?? label;
const MAX_CONTACTS = 5;

async function names(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name")
    .in("id", [...new Set(ids)]);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((profile) => [profile.id, profile.first_name]));
}

async function loadAll(userId: string) {
  const today = formatInTimeZone(new Date(), "Africa/Casablanca", "yyyy-MM-dd");
  const bookingsResult = await supabase
    .from("bookings")
    .select(
      "id, travel_date, pickup_eta, walk_meters, price_dh, status, trips(origin_label, dest_label, driver_id, departure_time)",
    )
    .eq("passenger_id", userId)
    .order("travel_date", { ascending: false })
    .limit(50);
  if (bookingsResult.error) throw bookingsResult.error;
  const tripsResult = await supabase
    .from("trips")
    .select("*")
    .eq("driver_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (tripsResult.error) throw tripsResult.error;
  const trips = tripsResult.data ?? [];
  const incoming =
    trips.length === 0
      ? []
      : await (async () => {
          const result = await supabase
            .from("bookings")
            .select("id, trip_id, travel_date, pickup_eta, walk_meters, passenger_id")
            .in(
              "trip_id",
              trips.map((trip) => trip.id),
            )
            .neq("status", "cancelled")
            .gte("travel_date", today)
            .order("travel_date")
            .limit(200);
          if (result.error) throw result.error;
          return result.data ?? [];
        })();
  const bookings = bookingsResult.data ?? [];
  const people = await names(
    [
      ...bookings.map((item) => item.trips?.driver_id ?? ""),
      ...incoming.map((item) => item.passenger_id),
    ].filter(Boolean),
  );
  return { bookings, trips, incoming, people };
}

function MyTripsPage() {
  const account = useAccount();
  const client = useQueryClient();
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["my-trips", account.userId],
    queryFn: () => loadAll(account.userId as string),
    enabled: Boolean(account.userId),
  });
  const data = query.data;
  const contactsQuery = useQuery({
    queryKey: ["my-trips", "contacts", account.userId],
    enabled: Boolean(account.userId),
    queryFn: async () => {
      const { data: rows, error: failure } = await supabase
        .from("trusted_contacts")
        .select("id, name, phone")
        .eq("owner_id", account.userId as string)
        .order("created_at");
      if (failure) throw failure;
      return rows ?? [];
    },
  });
  const contacts = contactsQuery.data ?? [];
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactError, setContactError] = useState("");

  async function addContact(event: FormEvent) {
    event.preventDefault();
    setContactError("");
    const phone = normalizeMoroccanPhone(contactPhone);
    if (!account.userId) return;
    if (contactName.trim().length < 2) {
      setContactError("Indiquez le prénom de votre proche.");
      return;
    }
    if (!phone) {
      setContactError("Numéro invalide. Exemple : 06 12 34 56 78.");
      return;
    }
    if (contacts.length >= MAX_CONTACTS) {
      setContactError(`Vous pouvez enregistrer ${MAX_CONTACTS} proches au maximum.`);
      return;
    }
    const { error: failure } = await supabase
      .from("trusted_contacts")
      .insert({ owner_id: account.userId, name: contactName.trim().slice(0, 60), phone });
    if (failure) {
      setContactError("L’enregistrement n’a pas abouti. Réessayez.");
      return;
    }
    setContactName("");
    setContactPhone("");
    await client.invalidateQueries({ queryKey: ["my-trips", "contacts"] });
  }
  async function removeContact(id: string) {
    if (!account.userId) return;
    const { error: failure } = await supabase
      .from("trusted_contacts")
      .delete()
      .eq("id", id)
      .eq("owner_id", account.userId);
    if (failure) setContactError("La suppression n’a pas abouti. Réessayez.");
    else await client.invalidateQueries({ queryKey: ["my-trips", "contacts"] });
  }

  async function cancelBooking(id: string) {
    if (!account.userId || !window.confirm("Annuler cette réservation ?")) return;
    setError("");
    const { error: failure } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("passenger_id", account.userId);
    if (failure) setError("L’annulation n’a pas abouti. Réessayez.");
    else await client.invalidateQueries({ queryKey: ["my-trips"] });
  }
  async function setActive(id: string, active: boolean) {
    if (!account.userId) return;
    setError("");
    const { error: failure } = await supabase
      .from("trips")
      .update({ active })
      .eq("id", id)
      .eq("driver_id", account.userId);
    if (failure) setError("La modification n’a pas abouti. Réessayez.");
    else await client.invalidateQueries({ queryKey: ["my-trips"] });
  }

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-3xl space-y-10 px-5 py-8">
        <h2 className="font-display text-2xl font-bold">Mes trajets</h2>
        <RoleStatus />
        {!account.ready && (
          <p className="text-sm text-muted-foreground" role="status">
            Chargement…
          </p>
        )}
        {account.ready && !account.email && (
          <p className="text-sm">
            Connectez-vous pour voir vos trajets.{" "}
            <Button asChild variant="link" className="px-1">
              <Link to="/auth">Connexion</Link>
            </Button>
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {query.isError && (
          <p role="alert" className="text-sm text-destructive">
            Vos trajets n’ont pas pu être chargés. Actualisez la page.
          </p>
        )}
        {query.isLoading && account.userId && (
          <p className="text-sm text-muted-foreground" role="status">
            Chargement…
          </p>
        )}
        {data && (
          <>
            <section aria-labelledby="bookings-title">
              <h3 id="bookings-title" className="text-lg font-bold">
                Mes réservations
              </h3>
              {data.bookings.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Aucune réservation.{" "}
                  <Button asChild variant="link" className="px-1">
                    <Link to="/">Trouver un trajet</Link>
                  </Button>
                </p>
              )}
              <ul className="mt-3 space-y-3">
                {data.bookings.map((item) => (
                  <li key={item.id} className="rounded-2xl border bg-card p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold capitalize">{dayLabel(item.travel_date)}</span>
                      <span className="text-sm text-muted-foreground">
                        {STATUS[item.status] ?? item.status}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-2 text-sm">
                      <Car className="size-4 text-primary" />
                      {item.trips
                        ? `${shortLabel(item.trips.origin_label)} → ${shortLabel(item.trips.dest_label)}`
                        : "Trajet supprimé"}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3.5" />
                        RDV {clock(item.pickup_eta)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Footprints className="size-3.5" />
                        {item.walk_meters} m à pied
                      </span>
                      <span>{item.price_dh} DH</span>
                      {item.trips && (
                        <span>Conducteur : {data.people[item.trips.driver_id] ?? "—"}</span>
                      )}
                    </p>
                    {item.status !== "cancelled" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button asChild variant="soft" size="sm">
                          <Link to="/trajet/$bookingId" params={{ bookingId: item.id }}>
                            {item.status === "completed"
                              ? "Noter le conducteur"
                              : "Suivre le trajet"}
                          </Link>
                        </Button>
                        {item.status === "confirmed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => cancelBooking(item.id)}
                          >
                            Annuler
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="trips-title">
              <h3 id="trips-title" className="text-lg font-bold">
                Mes trajets publiés
              </h3>
              {data.trips.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Vous n’avez publié aucun trajet.{" "}
                  <Button asChild variant="link" className="px-1">
                    <Link to="/publier">Publier un trajet</Link>
                  </Button>
                </p>
              )}
              <ul className="mt-3 space-y-3">
                {data.trips.map((trip) => {
                  const riders = data.incoming.filter((item) => item.trip_id === trip.id);
                  return (
                    <li key={trip.id} className="rounded-2xl border bg-card p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold">
                          {shortLabel(trip.origin_label)} → {shortLabel(trip.dest_label)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {trip.active ? "Actif" : "Désactivé"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {clock(trip.departure_time)} ·{" "}
                        {trip.one_off_date
                          ? dayLabel(trip.one_off_date)
                          : trip.weekdays.map((day) => WEEKDAYS[day]).join(", ")}{" "}
                        · {trip.seats} place{trip.seats > 1 ? "s" : ""} · {trip.route_km} km
                      </p>
                      {riders.length > 0 && (
                        <ul
                          className="mt-3 space-y-1 border-t pt-3 text-sm"
                          aria-label="Passagers à venir"
                        >
                          {riders.map((rider) => (
                            <li key={rider.id}>
                              <span className="capitalize">{dayLabel(rider.travel_date)}</span> ·{" "}
                              {data.people[rider.passenger_id] ?? "Passager"} · RDV{" "}
                              {clock(rider.pickup_eta)} ({rider.walk_meters} m) ·{" "}
                              <Link
                                className="text-primary underline"
                                to="/trajet/$bookingId"
                                params={{ bookingId: rider.id }}
                              >
                                Suivre
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => setActive(trip.id, !trip.active)}
                      >
                        {trip.active ? "Désactiver" : "Réactiver"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}

        {account.email && (
          <section id="proches" aria-labelledby="close-title">
            <h3 id="close-title" className="text-lg font-bold">
              Mes proches de confiance
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Ils reçoivent, par SMS ou WhatsApp depuis votre téléphone, votre position et vos
              alertes SOS. Jusqu’à {MAX_CONTACTS} personnes.
            </p>
            <ul className="mt-3 space-y-2">
              {contacts.map((contact) => (
                <li
                  key={contact.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-sm"
                >
                  <span>
                    <b>{contact.name}</b> · {contact.phone}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-10"
                    aria-label={`Supprimer ${contact.name}`}
                    onClick={() => removeContact(contact.id)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
            {contacts.length < MAX_CONTACTS && (
              <form onSubmit={addContact} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  aria-label="Prénom du proche"
                  placeholder="Prénom"
                  className="h-12 rounded-xl border bg-card px-3 text-sm"
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                />
                <input
                  aria-label="Téléphone du proche"
                  type="tel"
                  inputMode="tel"
                  placeholder="06 12 34 56 78"
                  className="h-12 rounded-xl border bg-card px-3 text-sm"
                  value={contactPhone}
                  onChange={(event) => setContactPhone(event.target.value)}
                />
                <Button type="submit" variant="cta">
                  Ajouter
                </Button>
              </form>
            )}
            {contactError && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {contactError}
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
