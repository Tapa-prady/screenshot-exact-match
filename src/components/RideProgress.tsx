import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Car, CircleCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { bookingParty } from "@/lib/trips.functions";

type Status = "confirmed" | "cancelled" | "in_progress" | "completed";

/** Who you travel with, the driver's start / finish buttons, and the review once the ride is done. */
export function RideProgress({
  bookingId,
  userId,
  status,
}: {
  bookingId: string;
  userId: string;
  status: Status;
}) {
  const client = useQueryClient();
  const loadParty = useServerFn(bookingParty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stars, setStars] = useState(0);
  const party = useQuery({
    queryKey: ["party", bookingId],
    queryFn: () => loadParty({ data: { bookingId } }),
  });
  const review = useQuery({
    queryKey: ["review", bookingId, userId],
    enabled: status === "completed",
    queryFn: async () => {
      const { data } = await supabase
        .from("reviews")
        .select("rating")
        .eq("booking_id", bookingId)
        .eq("author_id", userId)
        .maybeSingle();
      return data;
    },
  });
  const other = party.data;

  async function move(next: "in_progress" | "completed") {
    setBusy(true);
    setError("");
    const { error: failure } = await supabase
      .from("bookings")
      .update({ status: next })
      .eq("id", bookingId);
    setBusy(false);
    if (failure) setError("Le changement d’état n’a pas pu être enregistré. Réessayez.");
    else
      await Promise.all([
        client.invalidateQueries({ queryKey: ["booking", bookingId] }),
        client.invalidateQueries({ queryKey: ["my-trips"] }),
      ]);
  }

  async function sendReview() {
    if (!other || stars < 1) return;
    setBusy(true);
    setError("");
    const { error: failure } = await supabase.from("reviews").insert({
      booking_id: bookingId,
      author_id: userId,
      target_id: other.otherId,
      rating: stars,
    });
    setBusy(false);
    if (failure) setError("Votre avis n’a pas pu être enregistré.");
    else await client.invalidateQueries({ queryKey: ["review", bookingId, userId] });
  }

  if (!other) return null;
  return (
    <section aria-label="Participants" className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <Car className="size-4 text-primary" />
        {other.role === "passenger" ? "Votre conducteur" : "Votre passager"} : {other.firstName}
        {other.rating > 0 && (
          <span className="font-normal text-muted-foreground">★ {other.rating.toFixed(1)}</span>
        )}
      </p>
      {other.vehicle && (
        <p className="text-muted-foreground">
          {other.vehicle.brand} {other.vehicle.color} · plaque{" "}
          <b className="text-foreground">{other.vehicle.plate}</b>
        </p>
      )}

      {other.role === "driver" && status === "confirmed" && (
        <Button
          variant="cta"
          className="w-full"
          disabled={busy}
          onClick={() => move("in_progress")}
        >
          Démarrer le trajet
        </Button>
      )}
      {other.role === "driver" && status === "in_progress" && (
        <Button variant="cta" className="w-full" disabled={busy} onClick={() => move("completed")}>
          Terminer le trajet
        </Button>
      )}
      {other.role === "passenger" && status === "in_progress" && (
        <p className="text-primary">Le conducteur a démarré le trajet.</p>
      )}

      {status === "completed" &&
        review.isSuccess &&
        (review.data ? (
          <p className="flex items-center gap-2 text-primary">
            <CircleCheck className="size-4" />
            Merci, votre avis ({review.data.rating}/5) est enregistré.
          </p>
        ) : (
          <div>
            <p className="font-semibold">Notez {other.firstName}</p>
            <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Note sur 5">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={stars === value}
                  aria-label={`${value} sur 5`}
                  className="rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setStars(value)}
                >
                  <Star
                    className={`size-7 ${value <= stars ? "fill-cta text-cta" : "text-muted-foreground"}`}
                  />
                </button>
              ))}
            </div>
            <Button className="mt-3" disabled={busy || stars < 1} onClick={sendReview}>
              Envoyer mon avis
            </Button>
          </div>
        ))}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
