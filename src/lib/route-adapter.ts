import { fromZonedTime } from "date-fns-tz";
import type { Coordinates } from "./ride-matching";

export function moroccoInstant(date: string, time: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) throw new Error("Invalid date or time");
  const instant = fromZonedTime(`${date}T${time}`, "Africa/Casablanca").getTime();
  if (!Number.isFinite(instant)) throw new Error("Invalid date or time");
  return instant;
}

export function legacyRouteCoordinates(value: unknown): Coordinates[] {
  if (!Array.isArray(value)) throw new Error("Invalid route");
  return value.map(entry => {
    if (!Array.isArray(entry) || entry.length !== 2 || !entry.every(v => typeof v === "number" && Number.isFinite(v))
      || Math.abs(entry[0]) > 90 || Math.abs(entry[1]) > 180) throw new Error("Invalid coordinate");
    return [entry[1], entry[0]];
  });
}

export function tripRunsOnDate(trip: { one_off_date: string | null; weekdays: number[] }, date: string): boolean {
  return trip.one_off_date ? trip.one_off_date === date : trip.weekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay() || 7);
}