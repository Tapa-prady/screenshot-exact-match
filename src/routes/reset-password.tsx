import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nouveau mot de passe — Rafiq" },
      { name: "description", content: "Choisissez un nouveau mot de passe pour votre compte Rafiq." },
      { property: "og:title", content: "Nouveau mot de passe — Rafiq" },
      { property: "og:description", content: "Réinitialisation du mot de passe Rafiq." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault(); setError("");
    if (password.length < 8) { setError("Au moins 8 caractères."); return; }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError("Le lien a expiré. Redemandez une réinitialisation."); return; }
    navigate({ to: "/", replace: true });
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <h1 className="font-display text-2xl font-bold">Nouveau mot de passe</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <input type="password" required aria-label="Nouveau mot de passe" className="h-12 w-full rounded-xl border bg-card px-3 text-sm" value={password} onChange={e => setPassword(e.target.value)} />
        <Button variant="cta" type="submit" className="w-full">Enregistrer</Button>
      </form>
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    </main>
  );
}
