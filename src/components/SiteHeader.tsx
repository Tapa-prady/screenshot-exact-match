import { Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/use-account";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/rafiq_logo.png.asset.json";

export function SiteHeader({ onSignOut }: { onSignOut?: () => void }) {
  const account = useAccount();
  async function signOut() { await supabase.auth.signOut(); onSignOut?.(); }
  return (
    <header className="border-b bg-card px-5 py-4">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2">
        <Link to="/" className="flex items-center gap-3"><img src={logo.url} alt="" className="size-12 rounded-xl" /><span className="font-display text-2xl font-bold">Rafiq</span></Link>
        <span className="ms-auto hidden items-center gap-2 text-sm text-primary lg:flex"><GraduationCap className="size-5" /><span>ENSA Tanger</span></span>
        {account.email && <nav aria-label="Navigation principale" className="order-3 flex w-full items-center gap-1 sm:order-none sm:w-auto">
          <Button asChild variant="ghost" size="sm"><Link to="/assistant">Rafiq IA</Link></Button>
          <Button asChild variant="ghost" size="sm"><Link to="/publier">Publier un trajet</Link></Button>
          <Button asChild variant="ghost" size="sm"><Link to="/mes-trajets">Mes trajets</Link></Button>
        </nav>}
        {account.email
          ? <Button variant="outline" size="sm" className="order-2 ms-auto sm:order-none sm:ms-0" onClick={signOut}>{account.email.split("@")[0]} · Déconnexion</Button>
          : <Button asChild variant="soft" size="sm" className="ms-auto sm:ms-0"><Link to="/auth">Connexion</Link></Button>}
      </div>
    </header>
  );
}
