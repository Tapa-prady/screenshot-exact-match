-- Rafiq · 0002 · security access rules
-- Apply once, after 0000_rafiq_core_schema.sql and 0001_security_guards.sql (Supabase / Lovable Cloud SQL editor).
--
-- Safe to run more than once (every policy is dropped before being created).
--
-- Why: Fixes Lovable critical findings:
-- 1. "Exposed personal & sensitive data" on public.profiles
-- 2. "Some access rules let everyone through" on public.trips, public.profiles, public.reviews
--
-- In 0000, "Students read profiles", "Students read trips", and "Students read reviews" used USING (true),
-- allowing any authenticated user to dump the entire user directory, all driver routes/coordinates, and all reviews.
--
-- After this migration:
-- - The server (via service_role / supabaseAdmin) searches and matches trips on behalf of the passenger.
-- - Client-side queries for trips are restricted to: the driver who published them OR passengers who booked them.
-- - Client-side queries for profiles are restricted to: one's own profile OR fellow travelers sharing a booking.
-- - Reviews can only be read by the author, target, or participants of that trip.

-- 1. Profiles: restrict read access to own profile or fellow travelers on the same booking.
DROP POLICY IF EXISTS "Students read profiles" ON public.profiles;

DROP POLICY IF EXISTS "Read own profile or ride partners" ON public.profiles;
CREATE POLICY "Read own profile or ride partners" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.trips t ON t.id = b.trip_id
      WHERE (b.passenger_id = auth.uid() AND t.driver_id = profiles.id)
         OR (t.driver_id = auth.uid() AND b.passenger_id = profiles.id)
    )
  );

-- 2. Trips: restrict read access to the driver or passengers with an existing booking.
DROP POLICY IF EXISTS "Students read trips" ON public.trips;
-- Added later by Lovable (0001_students_read_active_trips): same problem, every active trip readable by everyone.
DROP POLICY IF EXISTS "Students read active trips" ON public.trips;

DROP POLICY IF EXISTS "Driver reads own trips" ON public.trips;
CREATE POLICY "Driver reads own trips" ON public.trips
  FOR SELECT TO authenticated
  USING (auth.uid() = driver_id);

DROP POLICY IF EXISTS "Passenger reads booked trips" ON public.trips;
CREATE POLICY "Passenger reads booked trips" ON public.trips
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.trip_id = trips.id AND b.passenger_id = auth.uid()
    )
  );

-- 3. Reviews: restrict read access to author, target, or participants of that booking.
DROP POLICY IF EXISTS "Students read reviews" ON public.reviews;

DROP POLICY IF EXISTS "Parties read reviews" ON public.reviews;
CREATE POLICY "Parties read reviews" ON public.reviews
  FOR SELECT TO authenticated
  USING (
    auth.uid() = author_id
    OR auth.uid() = target_id
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = reviews.booking_id
        AND (b.passenger_id = auth.uid() OR public.is_trip_driver(b.trip_id, auth.uid()))
    )
  );
