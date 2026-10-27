-- Rafiq · 0004 · account roles (student / driver) and lower fares
-- Apply once in the SQL editor, after 0003. Safe to run more than once.
--
-- Roles: chosen when the account is created.
--   * @etu.uae.ac.ma address -> "student" (searches and books) or "driver" (publishes trips);
--     a verified member can switch later from the app.
--   * any other address      -> "driver" only (never "student").
-- Fares: 2 DH/km up to 5 km, 1 DH/km from 5 to 10 km, 0.5 DH/km beyond; minimum 5 DH, maximum 20 DH.

-- 1. The role column.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'student';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_type_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_type_check CHECK (account_type IN ('student', 'driver'));
UPDATE public.profiles SET account_type = 'driver' WHERE verified IS NOT TRUE;
-- Members who already published a trip keep publishing.
UPDATE public.profiles SET account_type = 'driver' WHERE id IN (SELECT driver_id FROM public.trips);

-- 2. Sign-up: the chosen role is honoured only for institutional addresses.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE institutional boolean := lower(NEW.email) LIKE '%@etu.uae.ac.ma';
BEGIN
  INSERT INTO public.profiles (id, first_name, verified, account_type)
  VALUES (NEW.id,
          COALESCE(NULLIF(NEW.raw_user_meta_data->>'first_name', ''), split_part(NEW.email,'@',1)),
          institutional,
          CASE WHEN institutional AND COALESCE(NEW.raw_user_meta_data->>'account_type', 'student') = 'student'
               THEN 'student' ELSE 'driver' END)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

-- 3. A member may switch role, but only a verified (institutional) member may become a student.
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
  IF NEW.account_type = 'student' AND NOT NEW.verified THEN
    RAISE EXCEPTION 'Seule une adresse @etu.uae.ac.ma peut créer un compte étudiant';
  END IF;
  RETURN NEW;
END $$;

-- 4. Who may publish and who may book, enforced in the database as well as in the app.
--    A SECURITY DEFINER helper reads the profile, so these policies never recurse into the
--    profile / trip / booking read rules.
CREATE OR REPLACE FUNCTION public.has_account_type(_user uuid, _type text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles
    WHERE id = _user AND account_type = _type AND (_type <> 'student' OR verified))
$$;
REVOKE ALL ON FUNCTION public.has_account_type(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_account_type(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Driver insert" ON public.trips;
CREATE POLICY "Driver insert" ON public.trips FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = driver_id AND public.has_account_type(auth.uid(), 'driver'));

DROP POLICY IF EXISTS "Passenger books" ON public.bookings;
CREATE POLICY "Passenger books" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = passenger_id AND public.has_account_type(auth.uid(), 'student'));

-- 5. Fares (the booking trigger prices every booking with this function).
CREATE OR REPLACE FUNCTION public.compute_price(km numeric)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT LEAST(20, GREATEST(5, round(
    LEAST(km,5)*2 + GREATEST(LEAST(km,10)-5,0)*1 + GREATEST(km-10,0)*0.5
  )))::int
$$;
