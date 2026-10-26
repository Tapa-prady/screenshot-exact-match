-- Rafiq · 0001 · security guards
-- Apply once, after 0000_rafiq_core_schema.sql (Supabase / Lovable Cloud SQL editor).
--
-- Why: row-level security decides WHICH rows a member can touch, not WHICH COLUMNS.
-- Before this migration a member could, from the browser console, give themselves a 5/5
-- rating, rewrite the price or pickup point of a booking, mark their own ride as completed
-- to unlock reviews, or review someone they never travelled with.
--
-- The guards below only restrict requests made through the API roles (authenticated, anon).
-- SECURITY DEFINER triggers (rating refresh, signup, notifications) and the SQL editor keep working.

-- 1. Profiles: a member edits their own profile, never their rating or verification.
CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.rating_avg IS DISTINCT FROM OLD.rating_avg
     OR NEW.rating_count IS DISTINCT FROM OLD.rating_count
     OR NEW.verified IS DISTINCT FROM OLD.verified
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Ces champs du profil ne peuvent pas être modifiés';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_guard ON public.profiles;
CREATE TRIGGER profiles_guard BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();

-- 2. Bookings: only the status may change, and only along allowed paths.
--    passenger or driver: confirmed / in_progress -> cancelled
--    driver only:         confirmed -> in_progress -> completed
CREATE OR REPLACE FUNCTION public.guard_booking_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.trip_id IS DISTINCT FROM OLD.trip_id
     OR NEW.passenger_id IS DISTINCT FROM OLD.passenger_id
     OR NEW.travel_date IS DISTINCT FROM OLD.travel_date
     OR NEW.pickup_lat IS DISTINCT FROM OLD.pickup_lat
     OR NEW.pickup_lng IS DISTINCT FROM OLD.pickup_lng
     OR NEW.walk_meters IS DISTINCT FROM OLD.walk_meters
     OR NEW.pickup_eta IS DISTINCT FROM OLD.pickup_eta
     OR NEW.ride_km IS DISTINCT FROM OLD.ride_km
     OR NEW.price_dh IS DISTINCT FROM OLD.price_dh
     OR NEW.desired_arrival IS DISTINCT FROM OLD.desired_arrival
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Cette réservation ne peut plus être modifiée';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status IN ('cancelled', 'completed') THEN
      RAISE EXCEPTION 'Cette réservation est terminée';
    ELSIF NEW.status = 'cancelled' THEN
      NULL;
    ELSIF public.is_trip_driver(OLD.trip_id, auth.uid())
          AND ((OLD.status = 'confirmed' AND NEW.status = 'in_progress')
            OR (OLD.status = 'in_progress' AND NEW.status = 'completed')) THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Changement de statut non autorisé';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bookings_guard ON public.bookings;
CREATE TRIGGER bookings_guard BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.guard_booking_update();

-- 3. Reviews: you can only rate the other person of your own booking.
CREATE OR REPLACE FUNCTION public.validate_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bookings; d uuid;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = NEW.booking_id;
  SELECT driver_id INTO d FROM public.trips WHERE id = b.trip_id;
  IF NEW.author_id = b.passenger_id THEN
    IF NEW.target_id IS DISTINCT FROM d THEN RAISE EXCEPTION 'Vous ne pouvez noter que votre conducteur'; END IF;
  ELSIF NEW.author_id = d THEN
    IF NEW.target_id IS DISTINCT FROM b.passenger_id THEN RAISE EXCEPTION 'Vous ne pouvez noter que votre passager'; END IF;
  ELSE
    RAISE EXCEPTION 'Vous ne participez pas à ce trajet';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reviews_validate ON public.reviews;
CREATE TRIGGER reviews_validate BEFORE INSERT ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.validate_review();

-- 4. Retention: live positions 24 h, assistant messages 30 days.
CREATE OR REPLACE FUNCTION public.purge_old_data()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.trip_positions WHERE created_at < now() - interval '24 hours';
  DELETE FROM public.ai_messages WHERE created_at < now() - interval '30 days';
$$;
REVOKE ALL ON FUNCTION public.purge_old_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_data() TO service_role;

-- Runs every hour when the pg_cron extension is enabled; otherwise call
-- `SELECT public.purge_old_data();` from the SQL editor now and then.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('rafiq-purge', '17 * * * *', 'SELECT public.purge_old_data()');
  END IF;
END $$;
