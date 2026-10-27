import { Link } from "@tanstack/react-router";
import { Car, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/use-account";

/** Home entry points: one account, two roles. Nobody has to guess where drivers go. */
export function RoleChooser() {
  const account = useAccount();
  // Only for visitors: once signed in, the account's mode decides where you land.
  if (!account.ready || account.email) return null;
  return (
    <section aria-label="Choisir un rôle" className="border-b bg-card/60 px-5 py-4">
      <div className="mx-auto grid max-w-6xl gap-3 sm:grid-cols-2">
        <Button
          asChild
          variant="outline"
          className="h-auto justify-start gap-3 whitespace-normal p-4 text-start"
        >
          <a href="#recherche">
            <UserRound className="!size-6 text-primary" />
            <span>
              <b className="block">Je suis passager</b>
              <span className="text-xs font-normal text-muted-foreground">
                Trouver un trajet vers l’ENSA
              </span>
            </span>
          </a>
        </Button>
        <Button
          asChild
          variant="cta"
          className="h-auto justify-start gap-3 whitespace-normal p-4 text-start"
        >
          <Link to="/publier">
            <Car className="!size-6" />
            <span>
              <b className="block">Je suis conducteur</b>
              <span className="text-xs font-normal opacity-90">
                {account.email
                  ? "Publier mon trajet et mes places libres"
                  : "Me connecter et publier mon trajet"}
              </span>
            </span>
          </Link>
        </Button>
      </div>
      {account.ready && !account.email && (
        <p className="mx-auto mt-3 max-w-6xl text-xs text-muted-foreground">
          Un seul compte pour les deux rôles : créez-le avec votre e-mail (l’adresse @etu.uae.ac.ma
          des étudiants n’est pas obligatoire pour conduire), puis choisissez conducteur ou passager
          à chaque trajet.
        </p>
      )}
    </section>
  );
}
