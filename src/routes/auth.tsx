import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/rafiq_logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string | undefined } => ({
    // Only same-site paths: never follow a link to another website after login.
    redirect:
      typeof search["redirect"] === "string" && /^\/(?!\/)/.test(search["redirect"])
        ? search["redirect"]
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Connexion — Rafiq" },
      {
        name: "description",
        content: "Connectez-vous à Rafiq : étudiants de l'ENSA Tanger et conducteurs.",
      },
      { property: "og:title", content: "Connexion — Rafiq" },
      {
        property: "og:description",
        content: "Le covoiturage réservé aux étudiants de l'ENSA Tanger.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const DOMAIN = "@etu.uae.ac.ma";
const field =
  "h-12 w-full rounded-xl border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function AuthPage() {
  const router = useRouter();
  const { redirect: after } = Route.useSearch();
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [firstName, setFirstName] = useState("");
  const [wanted, setWanted] = useState<"student" | "driver">("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const institutional = email.trim().toLowerCase().endsWith(DOMAIN);
  const accountType: "student" | "driver" = institutional ? wanted : "driver";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    const mail = email.trim().toLowerCase();
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(mail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setInfo("Un lien de réinitialisation vous a été envoyé par e-mail.");
      } else if (mode === "up") {
        if (password.length < 8) {
          setError("Le mot de passe doit contenir au moins 8 caractères.");
          return;
        }
        const { error } = await supabase.auth.signUp({
          email: mail,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { first_name: firstName.trim(), account_type: accountType },
          },
        });
        if (error) throw error;
        setInfo("Vérifiez votre boîte e-mail et cliquez sur le lien pour activer votre compte.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (error) throw error;
        router.history.replace(after ?? "/");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        /invalid login/i.test(msg)
          ? "E-mail ou mot de passe incorrect."
          : /not confirmed/i.test(msg)
            ? "Confirmez d’abord votre adresse via le lien reçu par e-mail."
            : /registered/i.test(msg)
              ? "Un compte existe déjà avec cette adresse."
              : "L’opération a échoué. Réessayez.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-10">
      <Link to="/" className="mb-6 flex items-center gap-3">
        <img src={logo.url} alt="" className="size-12 rounded-xl" />
        <span className="font-display text-2xl font-bold">Rafiq</span>
      </Link>
      <h1 className="font-display text-2xl font-bold">
        {mode === "up"
          ? "Créer un compte"
          : mode === "forgot"
            ? "Mot de passe oublié"
            : "Connexion"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Étudiants ({DOMAIN}) et conducteurs : toute adresse e-mail est acceptée.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === "up" && (
          <div>
            <label htmlFor="fn" className="mb-2 block text-sm font-semibold">
              Prénom
            </label>
            <input
              id="fn"
              required
              className={field}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
        )}
        <div>
          <label htmlFor="em" className="mb-2 block text-sm font-semibold">
            Adresse e-mail
          </label>
          <input
            id="em"
            type="email"
            required
            placeholder="prenom.nom@exemple.com"
            className={field}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {mode === "up" && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Je crée un compte pour</legend>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={accountType === "student" ? "default" : "outline"}
                className="h-auto whitespace-normal py-3"
                aria-pressed={accountType === "student"}
                disabled={!institutional}
                onClick={() => setWanted("student")}
              >
                <span>
                  <b className="block">Étudiant</b>
                  <span className="text-xs font-normal">je cherche un trajet</span>
                </span>
              </Button>
              <Button
                type="button"
                variant={accountType === "driver" ? "default" : "outline"}
                className="h-auto whitespace-normal py-3"
                aria-pressed={accountType === "driver"}
                onClick={() => setWanted("driver")}
              >
                <span>
                  <b className="block">Conducteur</b>
                  <span className="text-xs font-normal">je propose des trajets</span>
                </span>
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {institutional
                ? "Avec votre adresse étudiante, vous pouvez choisir. Vous pourrez changer de rôle plus tard."
                : "Les adresses autres que @etu.uae.ac.ma créent un compte Conducteur : seuls les étudiants cherchent et réservent."}
            </p>
          </fieldset>
        )}
        {mode !== "forgot" && (
          <div>
            <label htmlFor="pw" className="mb-2 block text-sm font-semibold">
              Mot de passe
            </label>
            <input
              id="pw"
              type="password"
              required
              className={field}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}
        <Button variant="cta" type="submit" className="w-full" disabled={busy}>
          {busy && <LoaderCircle className="animate-spin" />}
          {mode === "up"
            ? "Créer mon compte"
            : mode === "forgot"
              ? "Envoyer le lien"
              : "Se connecter"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {info && (
        <p role="status" className="mt-4 text-sm text-primary">
          {info}
        </p>
      )}
      <div className="mt-6 flex flex-col items-start gap-1 text-sm">
        {mode !== "in" && (
          <Button variant="link" className="px-0" onClick={() => setMode("in")}>
            J’ai déjà un compte
          </Button>
        )}
        {mode !== "up" && (
          <Button variant="link" className="px-0" onClick={() => setMode("up")}>
            Créer un compte
          </Button>
        )}
        {mode === "in" && (
          <Button variant="link" className="px-0" onClick={() => setMode("forgot")}>
            Mot de passe oublié ?
          </Button>
        )}
      </div>
    </main>
  );
}
