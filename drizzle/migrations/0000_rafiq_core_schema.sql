-- Roles
CREATE TYPE public.app_role AS ENUM ('admin','student');
CREATE TYPE public.booking_status AS ENUM ('confirmed','cancelled','in_progress','completed');

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL DEFAULT '',
  avatar_url text,
  major text,
  language text NOT NULL DEFAULT 'fr',
  rating_avg numeric(3,2) NOT NULL DEFAULT 0,
  rating_count int NOT NULL DEFAULT 0,
  verified boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own roles read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Signup: only @etu.uae.ac.ma, create profile + role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(NEW.email) NOT LIKE '%@etu.uae.ac.ma' THEN
    RAISE EXCEPTION 'Rafiq est réservé aux adresses @etu.uae.ac.ma';
  END IF;
  INSERT INTO public.profiles (id, first_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'first_name', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student');
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Price: 3 DH/km 0-5, 1 DH/km 5-10, 0.5 beyond; min 7, max 25
CREATE OR REPLACE FUNCTION public.compute_price(km numeric)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT LEAST(25, GREATEST(7, round(
    LEAST(km,5)*3 + GREATEST(LEAST(km,10)-5,0)*1 + GREATEST(km-10,0)*0.5
  )))::int
$$;

-- Vehicles
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  brand text NOT NULL,
  color text NOT NULL,
  plate text NOT NULL,
  seats int NOT NULL DEFAULT 3 CHECK (seats BETWEEN 1 AND 6),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own vehicles" ON public.vehicles FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Trips (route = jsonb array of [lat,lng] from OSRM)
CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  origin_label text NOT NULL,
  origin_lat double precision NOT NULL,
  origin_lng double precision NOT NULL,
  dest_label text NOT NULL,
  dest_lat double precision NOT NULL,
  dest_lng double precision NOT NULL,
  route jsonb NOT NULL DEFAULT '[]'::jsonb,
  route_km numeric(6,2) NOT NULL DEFAULT 0,
  route_minutes int NOT NULL DEFAULT 0,
  departure_time time NOT NULL,
  weekdays smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',
  one_off_date date,
  seats int NOT NULL DEFAULT 3 CHECK (seats BETWEEN 1 AND 6),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trips_active_idx ON public.trips (active, departure_time);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students read trips" ON public.trips FOR SELECT TO authenticated USING (true);
CREATE POLICY "Driver insert" ON public.trips FOR INSERT TO authenticated WITH CHECK (auth.uid() = driver_id);
CREATE POLICY "Driver update" ON public.trips FOR UPDATE TO authenticated USING (auth.uid() = driver_id) WITH CHECK (auth.uid() = driver_id);
CREATE POLICY "Driver delete" ON public.trips FOR DELETE TO authenticated USING (auth.uid() = driver_id);

-- Bookings with meeting point
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  passenger_id uuid NOT NULL,
  travel_date date NOT NULL,
  pickup_lat double precision NOT NULL,
  pickup_lng double precision NOT NULL,
  walk_meters int NOT NULL CHECK (walk_meters BETWEEN 0 AND 200),
  pickup_eta time,
  ride_km numeric(6,2) NOT NULL,
  price_dh int NOT NULL DEFAULT 0,
  desired_arrival time,
  status public.booking_status NOT NULL DEFAULT 'confirmed',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, passenger_id, travel_date)
);
CREATE INDEX bookings_trip_date_idx ON public.bookings (trip_id, travel_date);
GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_trip_driver(_trip_id uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.trips WHERE id = _trip_id AND driver_id = _user)
$$;

CREATE POLICY "Parties read bookings" ON public.bookings FOR SELECT TO authenticated
  USING (auth.uid() = passenger_id OR public.is_trip_driver(trip_id, auth.uid()));
CREATE POLICY "Passenger books" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = passenger_id);
CREATE POLICY "Parties update bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (auth.uid() = passenger_id OR public.is_trip_driver(trip_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.validate_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.trips; taken int;
BEGIN
  SELECT * INTO t FROM public.trips WHERE id = NEW.trip_id FOR UPDATE;
  IF t.driver_id = NEW.passenger_id THEN RAISE EXCEPTION 'Vous ne pouvez pas réserver votre propre trajet'; END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO taken FROM public.bookings
      WHERE trip_id = NEW.trip_id AND travel_date = NEW.travel_date AND status <> 'cancelled';
    IF taken >= t.seats THEN RAISE EXCEPTION 'Plus de place sur ce trajet'; END IF;
  END IF;
  NEW.price_dh := public.compute_price(NEW.ride_km);
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_validate BEFORE INSERT OR UPDATE OF ride_km, trip_id ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.validate_booking();

-- Reviews (only after completed booking)
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  target_id uuid NOT NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, author_id)
);
GRANT SELECT, INSERT ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students read reviews" ON public.reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "Author writes after trip" ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id AND EXISTS (
    SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.status = 'completed'
      AND (b.passenger_id = auth.uid() OR public.is_trip_driver(b.trip_id, auth.uid()))));

CREATE OR REPLACE FUNCTION public.refresh_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles p SET
    rating_avg = (SELECT COALESCE(avg(rating),0) FROM public.reviews WHERE target_id = NEW.target_id),
    rating_count = (SELECT count(*) FROM public.reviews WHERE target_id = NEW.target_id)
  WHERE p.id = NEW.target_id;
  RETURN NEW;
END $$;
CREATE TRIGGER reviews_rating AFTER INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.refresh_rating();

-- Trusted contacts
CREATE TABLE public.trusted_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trusted_contacts TO authenticated;
GRANT ALL ON public.trusted_contacts TO service_role;
ALTER TABLE public.trusted_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own contacts" ON public.trusted_contacts FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Live positions (purged after 24h)
CREATE TABLE public.trip_positions (
  id bigserial PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trip_positions_booking_idx ON public.trip_positions (booking_id, created_at DESC);
GRANT SELECT, INSERT ON public.trip_positions TO authenticated;
GRANT USAGE ON SEQUENCE public.trip_positions_id_seq TO authenticated;
GRANT ALL ON public.trip_positions TO service_role;
ALTER TABLE public.trip_positions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_booking_party(_booking_id uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.bookings b JOIN public.trips t ON t.id = b.trip_id
    WHERE b.id = _booking_id AND (b.passenger_id = _user OR t.driver_id = _user))
$$;
CREATE POLICY "Parties read positions" ON public.trip_positions FOR SELECT TO authenticated
  USING (public.is_booking_party(booking_id, auth.uid()));
CREATE POLICY "Parties write own position" ON public.trip_positions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_booking_party(booking_id, auth.uid()));
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_positions;

-- SOS events
CREATE TABLE public.sos_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  lat double precision,
  lng double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sos_events TO authenticated;
GRANT ALL ON public.sos_events TO service_role;
ALTER TABLE public.sos_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own SOS" ON public.sos_events FOR ALL TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = user_id);

-- In-app notifications (GPS path sent to driver & passenger)
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own notifications read" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own notifications update" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

CREATE OR REPLACE FUNCTION public.notify_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.trips;
BEGIN
  SELECT * INTO t FROM public.trips WHERE id = NEW.trip_id;
  INSERT INTO public.notifications (user_id, booking_id, kind, title, body) VALUES
    (NEW.passenger_id, NEW.id, 'booking', 'Place réservée', 'Votre point de rendez-vous et le tracé GPS sont prêts.'),
    (t.driver_id, NEW.id, 'booking', 'Nouvelle passagère', 'Un nouvel arrêt a été ajouté sur votre tracé GPS.');
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_notify AFTER INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.notify_booking();

-- AI conversations (purged after 30 days)
CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_user_idx ON public.ai_messages (user_id, created_at DESC);
GRANT SELECT, INSERT ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own AI messages" ON public.ai_messages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);