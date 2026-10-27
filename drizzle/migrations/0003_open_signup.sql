-- Rafiq · 0003 · open signup (drivers do not have to be students)
-- Apply once in the SQL editor. Safe to run more than once.
--
-- Before: sign-up was refused for any address other than @etu.uae.ac.ma.
-- Now: any address can register (e-mail confirmation still applies); the profile is marked
-- `verified` only for @etu.uae.ac.ma, so the app can show "Étudiant" or "Conducteur externe".
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, verified)
  VALUES (NEW.id,
          COALESCE(NULLIF(NEW.raw_user_meta_data->>'first_name', ''), split_part(NEW.email,'@',1)),
          lower(NEW.email) LIKE '%@etu.uae.ac.ma')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

-- Accounts created before this change were all students.
UPDATE public.profiles SET verified = true WHERE verified IS NOT TRUE
  AND id IN (SELECT id FROM auth.users WHERE lower(email) LIKE '%@etu.uae.ac.ma');

-- Booking a seat stays reserved to verified students, even for someone calling the API directly.
DROP POLICY IF EXISTS "Passenger books" ON public.bookings;
CREATE POLICY "Passenger books" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = passenger_id
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.verified)
  );
