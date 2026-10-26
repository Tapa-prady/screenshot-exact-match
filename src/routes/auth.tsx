import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/rafiq_logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — Rafiq" },
      { name: "description", content: "Connectez-vous à Rafiq avec votre adresse étudiante @etu.uae.ac.ma." },
      { property: "og:title", content: "Connexion — Rafiq" },
      { property: "og:description", content: "Le covoiturage réservé aux étudiants de l'ENSA Tanger." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const DOMAIN = "@etu.uae.ac.ma";
const field = "h-12 w-full rounded-xl border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(""); setInfo("");
    const mail = email.trim().toLowerCase();
    if (!mail.endsWith(DOMAIN)) { setError(`Utilisez votre adresse étudiante ${DOMAIN}.`); return; }
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setInfo("Un lien de réinitialisation vous a été envoyé par e-mail.");
      } else if (mode === "up") {
        if (password.length < 8) { setError("Le mot de passe doit contenir au moins 8 caractères."); return; }
        const { error } = await supabase.auth.signUp({ email: mail, password, options: { emailRedirectTo: window.location.origin, data: { first_name: firstName.trim() } } });
        if (error) throw error;
        setInfo("Vérifiez votre boîte e-mail étudiante et cliquez sur le lien pour activer votre compte.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (error) throw error;
        navigate({ to: "/", replace: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(/invalid login/i.test(msg) ? "E-mail ou mot de passe incorrect." : /not confirmed/i.test(msg) ? "Confirmez d’abord votre adresse via le lien reçu par e-mail." : /registered/i.test(msg) ? "Un compte existe déjà avec cette adresse." : "L’opération a échoué. Réessayez.");
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-10">
      <Link to="/" className="mb-6 flex items-center gap-3"><img src={logo.url} alt="" className="size-12 rounded-xl" /><span className="font-display text-2xl font-bold">Rafiq</span></Link>
      <h1 className="font-display text-2xl font-bold">{mode === "up" ? "Créer un compte" : mode === "forgot" ? "Mot de passe oublié" : "Connexion"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Réservé aux étudiants ({DOMAIN}).</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === "up" && <div><label htmlFor="fn" className="mb-2 block text-sm font-semibold">Prénom</label><input id="fn" required className={field} value={firstName} onChange={e => setFirstName(e.target.value)} /></div>}
        <div><label htmlFor="em" className="mb-2 block text-sm font-semibold">E-mail étudiant</label><input id="em" type="email" required placeholder={`prenom.nom${DOMAIN}`} className={field} value={email} onChange={e => setEmail(e.target.value)} /></div>
        {mode !== "forgot" && <div><label htmlFor="pw" className="mb-2 block text-sm font-semibold">Mot de passe</label><input id="pw" type="password" required className={field} value={password} onChange={e => setPassword(e.target.value)} /></div>}
        <Button variant="cta" type="submit" className="w-full" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}{mode === "up" ? "Créer mon compte" : mode === "forgot" ? "Envoyer le lien" : "Se connecter"}</Button>
      </form>
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      {info && <p role="status" className="mt-4 text-sm text-primary">{info}</p>}
      <div className="mt-6 flex flex-col items-start gap-1 text-sm">
        {mode !== "in" && <Button variant="link" className="px-0" onClick={() => setMode("in")}>J’ai déjà un compte</Button>}
        {mode !== "up" && <Button variant="link" className="px-0" onClick={() => setMode("up")}>Créer un compte</Button>}
        {mode === "in" && <Button variant="link" className="px-0" onClick={() => setMode("forgot")}>Mot de passe oublié ?</Button>}
      </div>
    </main>
  );
}
