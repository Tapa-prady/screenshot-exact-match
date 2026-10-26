import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Account {
  ready: boolean;
  userId: string | null;
  email: string | null;
}

/** Current Supabase session; `ready` stays false until the first answer so pages never flash "logged out". */
export function useAccount(): Account {
  const [account, setAccount] = useState<Account>({ ready: false, userId: null, email: null });
  useEffect(() => {
    const show = (user?: { id: string; email?: string | null } | null) =>
      setAccount({ ready: true, userId: user?.id ?? null, email: user?.email ?? null });
    supabase.auth.getSession().then(({ data }) => show(data.session?.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => show(session?.user));
    return () => data.subscription.unsubscribe();
  }, []);
  return account;
}
