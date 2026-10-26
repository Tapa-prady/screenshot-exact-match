import { createServerFn } from "@tanstack/react-start";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { findRideMatches } from "./ride-matching";
import { moroccoInstant, tripRunsOnDate } from "./route-adapter";
import { clockTime, coordinate, isoDate } from "./schemas";
import { routeRequest, verifiedGeometry, walkingResolver } from "./routing.server";

const place = z.object({ label: z.string().trim().min(3).max(200), coordinates: coordinate });

const MAX_ACTIVE_TRIPS = 10;
const MIN_ROUTE_METERS = 500;
const MAX_ROUTE_METERS = 60_000;

export const publishTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    origin: place,
    destination: place,
    departureTime: clockTime,
    weekdays: z.array(z.number().int().min(1).max(7)).max(7),
    oneOffDate: isoDate.nullable(),
    seats: z.number().int().min(1).max(6),
  }).refine(value => value.oneOffDate !== null || value.weekdays.length > 0, { message: "Choisissez au moins un jour." }))
  .handler(async ({ data, context }) => {
    const fail = (error: string) => ({ ok: false as const, error });
    try {
      if (data.oneOffDate && moroccoInstant(data.oneOffDate, data.departureTime) <= Date.now()) {
        return fail("Choisissez une date et une heure de départ futures.");
      }
      const { count, error: countError } = await context.supabase.from("trips")
        .select("id", { count: "exact", head: true }).eq("driver_id", context.userId).eq("active", true);
      if (countError) throw countError;
      if ((count ?? 0) >= MAX_ACTIVE_TRIPS) return fail(`Vous avez déjà ${MAX_ACTIVE_TRIPS} trajets actifs. Désactivez-en un d’abord.`);

      const { route } = await routeRequest("car", data.origin.coordinates, data.destination.coordinates);
      if (route.distance < MIN_ROUTE_METERS) return fail("Le départ et l’arrivée sont trop proches.");
      if (route.distance > MAX_ROUTE_METERS) return fail("Ce trajet dépasse 60 km : Rafiq est prévu pour les trajets quotidiens vers l’école.");
      const annotation = route.legs[0]?.annotation;
      if (!annotation || annotation.distance.length !== route.geometry.coordinates.length - 1 || annotation.duration.length !== route.geometry.coordinates.length - 1) {
        return fail("L’itinéraire de ce trajet n’a pas pu être vérifié. Réessayez dans un instant.");
      }
      // Persist the provider's exact geometry as [lat, lng]; search verifies against the same request.
      const stored = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]) as Json;
      const { data: row, error } = await context.supabase.from("trips").insert({
        driver_id: context.userId,
        origin_label: data.origin.label, origin_lng: data.origin.coordinates[0], origin_lat: data.origin.coordinates[1],
        dest_label: data.destination.label, dest_lng: data.destination.coordinates[0], dest_lat: data.destination.coordinates[1],
        route: stored,
        route_km: Math.round(route.distance / 10) / 100,
        route_minutes: Math.max(1, Math.round(route.duration / 60)),
        departure_time: data.departureTime,
        weekdays: data.oneOffDate ? [] : [...new Set(data.weekdays)].sort(),
        one_off_date: data.oneOffDate,
        seats: data.seats,
      }).select("id, route_km, route_minutes").single();
      if (error) throw error;
      return { ok: true as const, id: row.id, routeKm: row.route_km, routeMinutes: row.route_minutes };
    } catch {
      return fail("La publication n’a pas abouti. Réessayez dans un instant.");
    }
  });

export const bookRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ tripId: z.string().uuid(), date: isoDate, arrival: clockTime, origin: coordinate }))
  .handler(async ({ data, context }) => {
    const fail = (error: string) => ({ ok: false as const, error });
    try {
      const deadline = moroccoInstant(data.date, data.arrival);
      if (deadline <= Date.now()) return fail("Choisissez une heure d’arrivée future.");
      const { data: trip, error: tripError } = await context.supabase.from("trips").select("*").eq("id", data.tripId).maybeSingle();
      if (tripError) throw tripError;
      if (!trip || !trip.active || !tripRunsOnDate(trip, data.date)) return fail("Ce trajet n’est plus proposé à cette date.");
      if (trip.driver_id === context.userId) return fail("Vous ne pouvez pas réserver votre propre trajet.");

      // Recompute the meeting point on the server: never trust prices, times or positions sent by the browser.
      const geometry = await verifiedGeometry(trip);
      if (!geometry) return fail("L’itinéraire du conducteur n’a pas pu être vérifié. Réessayez dans un instant.");
      const { data: profile } = await context.supabase.from("profiles").select("rating_avg").eq("id", trip.driver_id).maybeSingle();
      const [match] = await findRideMatches({
        passengerPosition: data.origin, desiredArrivalTime: deadline, earliestPickupTime: Date.now(),
        routes: [{ id: trip.id, ...geometry, departureTime: moroccoInstant(data.date, trip.departure_time), seatsAvailable: trip.seats, rating: profile?.rating_avg ?? 0 }],
        resolveWalkingRoute: walkingResolver(() => undefined),
      });
      if (!match) return fail("Ce rendez-vous n’est plus disponible. Relancez la recherche.");

      const { data: booking, error } = await context.supabase.from("bookings").insert({
        trip_id: trip.id,
        passenger_id: context.userId,
        travel_date: data.date,
        pickup_lng: match.meetingPoint[0], pickup_lat: match.meetingPoint[1],
        walk_meters: Math.min(200, Math.max(0, Math.round(match.walkingRoute.distanceMeters))),
        pickup_eta: formatInTimeZone(match.pickupTime, "Africa/Casablanca", "HH:mm"),
        ride_km: Math.round(match.passengerDistanceKm * 100) / 100,
        price_dh: match.priceDh,
        desired_arrival: data.arrival,
      }).select("id, price_dh").single();
      if (error) {
        if (error.code === "23505") return fail("Vous avez déjà réservé ce trajet pour cette date.");
        if (/Plus de place/.test(error.message)) return fail("Plus de place sur ce trajet.");
        throw error;
      }
      return { ok: true as const, bookingId: booking.id, priceDh: booking.price_dh, pickupTime: match.pickupTime };
    } catch {
      return fail("La réservation n’a pas abouti. Réessayez dans un instant.");
    }
  });
