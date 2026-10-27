import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/use-account";
import { useProfile, type AccountType } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";

const NAME: Record<AccountType, string> = { student: "Étudiant", driver: "Conducteur" };

/**
 * Shown on a page that needs the other role. Verified (@etu.uae.ac.ma) members can switch in one
 * tap; other members are told why they cannot.
 */
export function RoleSwitch({ needs }: { needs: AccountType }) {
  const account = useAccount();
  const profile = useProfile(account.userId);
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = profile.data?.accountType;
  if (!current || current === needs) return null;

  async function switchRole() {
    if (!account.userId) return;
    setBusy(true);
    setError("");
    const { error: failure } = await supabase
      .from("profiles")
      .update({ account_type: needs })
      .eq("id", account.userId);
    setBusy(false);
    if (failure) setError("Le changement de rôle n’a pas pu être enregistré.");
    else await client.invalidateQueries({ queryKey: ["profile", account.userId] });
  }

  return (
    <div role="status" className="rounded-2xl border border-primary/30 bg-accent p-4 text-sm">
      <p>
        Votre compte est en mode <b>{NAME[current]}</b>.{" "}
        {needs === "driver"
          ? "Pour publier un trajet, il doit être en mode Conducteur."
          : "Pour chercher et réserver un trajet, il doit être en mode Étudiant."}
      </p>
      {needs === "student" && !profile.data?.verified ? (
        <p className="mt-2 text-muted-foreground">
          Seuls les comptes créés avec une adresse @etu.uae.ac.ma peuvent passer en mode Étudiant.
        </p>
      ) : (
        <Button className="mt-3" size="sm" variant="cta" disabled={busy} onClick={switchRole}>
          Passer en mode {NAME[needs]}
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** One line in "Mes trajets": the current mode, and a switch for verified members. */
export function RoleStatus() {
  const account = useAccount();
  const profile = useProfile(account.userId);
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const current = profile.data?.accountType;
  if (!current) return null;
  const other: AccountType = current === "student" ? "driver" : "student";
  async function change() {
    if (!account.userId) return;
    setBusy(true);
    await supabase.from("profiles").update({ account_type: other }).eq("id", account.userId);
    setBusy(false);
    await client.invalidateQueries({ queryKey: ["profile", account.userId] });
  }
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      Mode du compte : <b className="text-foreground">{NAME[current]}</b>
      {(other === "driver" || profile.data?.verified) && (
        <Button size="sm" variant="outline" disabled={busy} onClick={change}>
          Passer en mode {NAME[other]}
        </Button>
      )}
    </p>
  );
}
