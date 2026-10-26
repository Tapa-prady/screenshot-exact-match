import { formatInTimeZone } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { forecastFor } from "./assistant.server";

export interface WeatherAlertResult {
  bookingId: string;
  travelDate: string;
  probability: number | null;
  millimetres: number | null;
  notified: boolean;
}

/**
 * Checks weather forecast for upcoming bookings and dispatches in-app notifications
 * to both driver and passenger when rain is predicted (>= 35% probability or >= 0.4mm).
 */
export async function checkAndNotifyWeatherAlerts(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<WeatherAlertResult[]> {
  const today = formatInTimeZone(new Date(), "Africa/Casablanca", "yyyy-MM-dd");

  // Get active upcoming bookings where user is passenger or driver
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(
      "id, travel_date, pickup_eta, passenger_id, status, trips(id, driver_id, departure_time)",
    )
    .gte("travel_date", today)
    .neq("status", "cancelled")
    .limit(20);

  if (error || !bookings) return [];

  const results: WeatherAlertResult[] = [];

  for (const booking of bookings) {
    const trip = booking.trips;
    if (!trip) continue;
    // Only check if user is a party of the booking
    if (booking.passenger_id !== userId && trip.driver_id !== userId) continue;

    const time = (booking.pickup_eta ?? trip.departure_time ?? "08:00").slice(0, 5);
    const forecast = await forecastFor(booking.travel_date, time);

    const isRainy =
      (forecast.probability !== null && forecast.probability >= 35) ||
      (forecast.millimetres !== null && forecast.millimetres >= 0.4);

    if (!isRainy) {
      results.push({
        bookingId: booking.id,
        travelDate: booking.travel_date,
        probability: forecast.probability,
        millimetres: forecast.millimetres,
        notified: false,
      });
      continue;
    }

    // Check if notification already exists for this booking
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("booking_id", booking.id)
      .eq("kind", "weather_rain")
      .limit(1);

    if (existing && existing.length > 0) {
      results.push({
        bookingId: booking.id,
        travelDate: booking.travel_date,
        probability: forecast.probability,
        millimetres: forecast.millimetres,
        notified: true,
      });
      continue;
    }

    const probText = forecast.probability !== null ? `${forecast.probability}%` : "forte";

    // Insert notification for passenger
    await supabase.from("notifications").insert([
      {
        user_id: booking.passenger_id,
        booking_id: booking.id,
        kind: "weather_rain",
        title: "🌧️ Pluie prévue pour votre trajet",
        body: `Une averse (${probText}) est annoncée le ${booking.travel_date} vers ${time}. Prévoyez un parapluie pour rejoindre votre point de rendez-vous !`,
        read: false,
      },
      {
        user_id: trip.driver_id,
        booking_id: booking.id,
        kind: "weather_rain",
        title: "🌧️ Alerte pluie pour votre covoiturage",
        body: `Des précipitations (${probText}) sont prévues le ${booking.travel_date} vers ${time}. Adaptez votre vitesse pour récupérer vos passagers en toute sécurité.`,
        read: false,
      },
    ]);

    results.push({
      bookingId: booking.id,
      travelDate: booking.travel_date,
      probability: forecast.probability,
      millimetres: forecast.millimetres,
      notified: true,
    });
  }

  return results;
}
