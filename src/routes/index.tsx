import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  LocateFixed, GraduationCap, Sparkles, Star, Footprints, Clock, ShieldCheck,
  Phone as PhoneIcon, Share2, Car, Users, Home, CalendarDays, MessageCircle, User, ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/rafiq_logo.png.asset.json";
import mapImg from "@/assets/map-mock.jpg";
import { PriceCalculator } from "@/components/PriceCalculator";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rafiq — Maquettes et design" },
      { name: "description", content: "Les écrans de Rafiq : accueil, résultats, réservation, suivi et SOS." },
      { property: "og:title", content: "Rafiq — Maquettes et design" },
      { property: "og:description", content: "Trouver. Partager. Arriver. Covoiturage ENSA Tanger." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Phone({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col items-center gap-3">
      <div className="relative h-[680px] w-[330px] overflow-hidden rounded-[2.75rem] border-[10px] border-navy bg-background shadow-card">
        {children}
      </div>
      <figcaption className="text-sm font-semibold text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

function TabBar({ active }: { active: number }) {
  const items = [
    { icon: Home, label: "Accueil" },
    { icon: CalendarDays, label: "Trajets" },
    { icon: MessageCircle, label: "Rafiq IA" },
    { icon: User, label: "Profil" },
  ];
  return (
    <nav className="absolute inset-x-0 bottom-0 flex justify-around border-t bg-card px-2 pb-4 pt-2">
      {items.map((it, i) => (
        <span key={it.label} className={`flex min-w-12 flex-col items-center gap-0.5 text-[11px] font-semibold ${i === active ? "text-primary" : "text-muted-foreground"}`}>
          <it.icon className="size-5" />
          {it.label}
        </span>
      ))}
    </nav>
  );
}

function HomeScreen() {
  return (
    <>
      <div className="bg-brand-gradient px-5 pb-16 pt-10 text-primary-foreground">
        <div className="flex items-center gap-2">
          <img src={logo.url} alt="" className="size-8 rounded-lg" />
          <span className="font-display text-lg font-bold">Rafiq</span>
        </div>
        <h1 className="mt-6 text-2xl font-bold leading-tight">Bonjour Sara,<br />où allez-vous ?</h1>
      </div>
      <div className="-mt-10 px-4">
        <div className="rounded-3xl bg-card p-4 shadow-card">
          <div className="flex items-center gap-3 rounded-2xl bg-muted px-3 py-3">
            <LocateFixed className="size-5 text-primary" />
            <div>
              <p className="text-[11px] text-muted-foreground">Départ</p>
              <p className="text-sm font-semibold">Ma position actuelle</p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3 rounded-2xl bg-muted px-3 py-3">
            <GraduationCap className="size-5 text-primary" />
            <div>
              <p className="text-[11px] text-muted-foreground">Arrivée</p>
              <p className="text-sm font-semibold">ENSA Tanger</p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3 rounded-2xl bg-muted px-3 py-3">
            <Clock className="size-5 text-primary" />
            <div>
              <p className="text-[11px] text-muted-foreground">Arriver avant</p>
              <p className="text-sm font-semibold">Demain · 8h20</p>
            </div>
          </div>
          <Button variant="cta" size="lg" className="mt-4 w-full">Trouver un trajet</Button>
        </div>
        <button className="mt-4 flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-start">
          <span className="grid size-10 place-items-center rounded-xl bg-accent"><Sparkles className="size-5 text-primary" /></span>
          <span>
            <span className="block text-sm font-bold">Demander à Rafiq IA</span>
            <span className="block text-xs text-muted-foreground">« Un trajet demain 7h30 ? »</span>
          </span>
        </button>
      </div>
      <TabBar active={0} />
    </>
  );
}

function ResultCard({ name, walk, time, price, rating, seats, best }: { name: string; walk: number; time: string; price: number; rating: string; seats: number; best?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-card p-3 ${best ? "border-primary" : ""}`}>
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-full bg-secondary font-bold text-secondary-foreground">{name[0]}</div>
        <div className="flex-1">
          <p className="flex items-center gap-1 text-sm font-bold">{name} <ShieldCheck className="size-4 text-success" /></p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><Star className="size-3 fill-cta text-cta" />{rating} · {seats} places</p>
        </div>
        <p className="font-display text-lg font-bold">{price} DH</p>
      </div>
      <div className="mt-2 flex gap-3 text-xs font-semibold text-muted-foreground">
        <span className="flex items-center gap-1"><Footprints className="size-3.5" />{walk} min à pied</span>
        <span className="flex items-center gap-1"><Car className="size-3.5" />passe à {time}</span>
      </div>
    </div>
  );
}

function ResultsScreen() {
  return (
    <>
      <div className="relative h-[300px]">
        <img src={mapImg} alt="" className="size-full object-cover" width={768} height={1024} />
        <div className="absolute left-4 top-8 grid size-10 place-items-center rounded-full bg-card shadow-card"><ChevronLeft className="size-5" /></div>
        <svg className="absolute inset-0 size-full" viewBox="0 0 330 300" fill="none">
          <path d="M20 250 C 90 220, 120 160, 180 140 S 290 70, 320 40" className="stroke-primary" strokeWidth="5" strokeLinecap="round" />
          <path d="M140 205 L 158 160" className="stroke-navy" strokeWidth="3" strokeDasharray="2 6" strokeLinecap="round" />
        </svg>
        <span className="absolute left-[132px] top-[197px] size-4 rounded-full border-[3px] border-card bg-navy" />
        <span className="absolute left-[150px] top-[148px] grid size-6 place-items-center">
          <span className="absolute size-6 rounded-full bg-cta animate-pulse-ring" />
          <span className="size-5 rounded-full border-[3px] border-card bg-cta" />
        </span>
      </div>
      <div className="-mt-6 rounded-t-3xl bg-background px-4 pt-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <h2 className="text-lg font-bold">3 trajets pour vous</h2>
        <p className="text-xs text-muted-foreground">Point de rendez-vous à moins de 200 m</p>
        <div className="mt-3 space-y-2">
          <ResultCard name="Yassine" walk={3} time="7h42" price={23} rating="4,9" seats={2} best />
          <ResultCard name="Imane" walk={4} time="7h35" price={22} rating="4,8" seats={1} />
          <ResultCard name="Omar" walk={2} time="7h55" price={23} rating="4,6" seats={3} />
        </div>
      </div>
    </>
  );
}

function DetailScreen() {
  return (
    <div className="flex h-full flex-col">
      <div className="bg-brand-gradient px-5 pb-8 pt-10 text-primary-foreground">
        <ChevronLeft className="size-6" />
        <div className="mt-4 flex items-center gap-3">
          <div className="grid size-14 place-items-center rounded-full bg-card text-xl font-bold text-navy">Y</div>
          <div>
            <p className="flex items-center gap-1 text-lg font-bold">Yassine <ShieldCheck className="size-5" /></p>
            <p className="text-sm opacity-90">Génie informatique · <Star className="inline size-3.5 fill-cta text-cta" /> 4,9 (38 avis)</p>
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-3 px-4 py-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[["35 min", "Durée"], ["3 min", "À pied"], ["2", "Places"]].map(([v, l]) => (
            <div key={l} className="rounded-2xl bg-muted p-3"><p className="font-display font-bold">{v}</p><p className="text-[11px] text-muted-foreground">{l}</p></div>
          ))}
        </div>
        <div className="rounded-2xl border bg-card p-4 text-sm">
          <p className="flex items-center gap-2"><Footprints className="size-4 text-primary" /> RDV : Bd Mohammed VI, 7h42</p>
          <p className="mt-2 flex items-center gap-2"><GraduationCap className="size-4 text-primary" /> Arrivée ENSA : 8h17</p>
          <p className="mt-2 flex items-center gap-2"><Car className="size-4 text-primary" /> Dacia Logan blanche</p>
        </div>
        <p className="rounded-2xl bg-accent p-3 text-xs text-accent-foreground">« Toujours à l'heure, voiture propre. » — Salma</p>
      </div>
      <div className="border-t bg-card p-4">
        <div className="mb-2 flex items-baseline justify-between"><span className="text-sm text-muted-foreground">Prix (partage de frais)</span><span className="font-display text-2xl font-bold">23 DH</span></div>
        <Button variant="cta" size="lg" className="w-full">Réserver ma place</Button>
      </div>
    </div>
  );
}

function TrackingScreen() {
  return (
    <>
      <img src={mapImg} alt="" className="absolute inset-0 size-full object-cover" width={768} height={1024} loading="lazy" />
      <svg className="absolute inset-0 size-full" viewBox="0 0 330 680" fill="none">
        <path d="M30 600 C 100 520, 140 420, 190 360 S 300 200, 320 120" className="stroke-primary" strokeWidth="6" strokeLinecap="round" />
      </svg>
      <span className="absolute left-[176px] top-[340px] grid size-10 place-items-center rounded-full bg-navy shadow-card"><Car className="size-5 text-primary-foreground" /></span>
      <div className="absolute inset-x-3 top-8 flex items-center gap-2 rounded-2xl bg-card p-3 shadow-card">
        <span className="size-2.5 rounded-full bg-success" />
        <p className="flex-1 text-sm font-semibold">Yassine arrive dans 4 min</p>
        <Share2 className="size-5 text-primary" />
      </div>
      <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-card p-4">
        <p className="text-xs text-muted-foreground">Maman voit votre position en direct</p>
        <div className="mt-3 flex gap-2">
          <Button variant="soft" className="flex-1"><PhoneIcon /> Appeler</Button>
          <Button variant="soft" className="flex-1"><Users /> Mes proches</Button>
        </div>
        <Button variant="sos" size="lg" className="mt-3 w-full">SOS · Appeler le 19</Button>
      </div>
    </>
  );
}

function Swatch({ name, className, hex }: { name: string; className: string; hex: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`size-12 rounded-2xl border ${className}`} />
      <div><p className="text-sm font-bold">{name}</p><p className="text-xs text-muted-foreground">{hex}</p></div>
    </div>
  );
}

function Index() {
  return (
    <main className="min-h-screen pb-20">
      <header className="bg-brand-gradient px-6 py-14 text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 md:flex-row md:items-center">
          <img src={logo.url} alt="Logo Rafiq" className="size-24 rounded-3xl shadow-card" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest opacity-80">Étape 4 · Design</p>
            <h1 className="mt-1 text-4xl font-extrabold md:text-5xl">Rafiq</h1>
            <p className="mt-2 text-lg opacity-90">Trouver. Partager. Arriver.</p>
          </div>
        </div>
      </header>

      <PriceCalculator />

      <section className="mx-auto mt-10 grid max-w-6xl gap-6 px-6 md:grid-cols-[1fr_2fr]">
        <div className="rounded-3xl bg-card p-6 shadow-card">
          <h2 className="text-lg font-bold">Couleurs</h2>
          <div className="mt-4 space-y-3">
            <Swatch name="Bleu nuit" className="bg-navy" hex="#0B1E3F" />
            <Swatch name="Turquoise" className="bg-teal" hex="#10878C" />
            <Swatch name="Orange · action principale" className="bg-cta" hex="#FFB020" />
            <Swatch name="Rouge · SOS uniquement" className="bg-sos" hex="Urgence" />
          </div>
        </div>
        <div className="rounded-3xl bg-card p-6 shadow-card">
          <h2 className="text-lg font-bold">Règles</h2>
          <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <li className="rounded-2xl bg-muted p-4"><b>Un écran = une action.</b> Un seul bouton orange par écran.</li>
            <li className="rounded-2xl bg-muted p-4"><b>Gros boutons.</b> 48 px minimum, faciles au pouce.</li>
            <li className="rounded-2xl bg-muted p-4"><b>Coins arrondis</b> comme le logo, beaucoup d'espace.</li>
            <li className="rounded-2xl bg-muted p-4"><b>Textes courts</b> en français, arabe (droite à gauche) et anglais.</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="cta">Action principale</Button>
            <Button variant="soft">Secondaire</Button>
            <Button variant="sos">SOS</Button>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-12 max-w-6xl px-6">
        <h2 className="text-2xl font-bold">Le parcours de Sara</h2>
        <p className="mt-1 text-muted-foreground">Trouver → Réserver → Voyager, en 3 appuis.</p>
        <div className="mt-8 flex gap-8 overflow-x-auto pb-6">
          <Phone label="1 · Accueil"><HomeScreen /></Phone>
          <Phone label="2 · Résultats + point de RDV"><ResultsScreen /></Phone>
          <Phone label="3 · Détail et réservation"><DetailScreen /></Phone>
          <Phone label="4 · Suivi en direct + SOS"><TrackingScreen /></Phone>
        </div>
      </section>
    </main>
  );
}
