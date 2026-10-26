import { createFileRoute } from "@tanstack/react-router";
import { RideSearch } from "@/components/RideSearch";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rafiq — Trouver un trajet vers l’ENSA Tanger" },
      {
        name: "description",
        content:
          "Recherchez un covoiturage étudiant avec votre position et votre heure d’arrivée, à 200 m maximum du rendez-vous.",
      },
      { property: "og:title", content: "Rafiq — Covoiturage étudiant ENSA Tanger" },
      {
        property: "og:description",
        content:
          "Votre position, votre heure d’arrivée, un rendez-vous sur le trajet du conducteur.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RideSearch,
});
