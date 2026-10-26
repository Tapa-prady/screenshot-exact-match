import { useEffect, useState } from "react";
import { Download, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/use-pwa-install";

export function PWAInstallButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Avoid SSR / client-hydration mismatch
  if (!mounted || isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <Button
        onClick={() => void install()}
        variant="outline"
        size="sm"
        className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
      >
        <Download className="size-4" />
        <span className="hidden sm:inline">Installer l’application</span>
        <span className="sm:hidden">Installer</span>
      </Button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <Button
          onClick={() => setShowIOSGuide(true)}
          variant="outline"
          size="sm"
          className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
        >
          <Smartphone className="size-4" />
          <span className="hidden sm:inline">Installer sur iPhone</span>
          <span className="sm:hidden">Installer</span>
        </Button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl border">
              <div className="flex items-center justify-between pb-3 border-b">
                <h3 className="font-display font-bold text-foreground">
                  Installer Rafiq sur iPhone
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
                  aria-label="Fermer"
                >
                  <X className="size-5" />
                </button>
              </div>
              <ol className="mt-4 space-y-3 text-sm text-muted-foreground list-decimal pl-5">
                <li>
                  Touchez le bouton <strong>Partager</strong>{" "}
                  <span className="inline-block px-1 bg-muted rounded">⎋</span> dans la barre Safari
                  du bas.
                </li>
                <li>
                  Faites défiler vers le bas et appuyez sur <strong>Sur l’écran d’accueil</strong>.
                </li>
                <li>
                  Confirmez avec <strong>Ajouter</strong> en haut à droite.
                </li>
              </ol>
              <Button
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-xl"
                variant="secondary"
              >
                Compris
              </Button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
