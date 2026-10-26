import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { formatInTimeZone } from "date-fns-tz";
import { CircleCheck, LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { useAccount } from "@/hooks/use-account";
import type { ChatContext } from "@/lib/assistant";
import { askRafiq } from "@/lib/assistant.functions";
import { bookRide } from "@/lib/trips.functions";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "Rafiq IA — Rafiq" },
      { name: "description", content: "Discutez avec Rafiq IA : il trouve un trajet, propose de réserver et vous prévient pour la pluie." },
      { property: "og:title", content: "Rafiq IA — Rafiq" },
      { property: "og:description", content: "Plus besoin de chercher dans des menus : on discute." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssistantPage,
});

type Reply = Extract<Awaited<ReturnType<typeof askRafiq>>, { ok: true }>;
type Message = { id: number; role: "user" | "assistant"; text: string; offer?: Reply["offer"]; bookingId?: string };
const EXAMPLES = ["Un trajet demain 7h30 depuis Malabata", "Et s’il pleut ?"];
const EMPTY_CONTEXT: ChatContext = { date: null, arrival: null, originText: null };

function AssistantPage() {
  const account = useAccount();
  const ask = useServerFn(askRafiq);
  const book = useServerFn(bookRide);
  const [messages, setMessages] = useState<Message[]>([{ id: 0, role: "assistant", text: "Bonjour ! Dites-moi d’où vous partez et à quelle heure vous devez arriver, par exemple : « un trajet demain 7h30 depuis Malabata »." }]);
  const [context, setContext] = useState<ChatContext>(EMPTY_CONTEXT);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<"ask" | "book" | null>(null);
  const [simple, setSimple] = useState(false);
  const counter = useRef(1);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "end" }); }, [messages, busy]);

  const push = (message: Omit<Message, "id">) => setMessages(current => [...current, { ...message, id: counter.current++ }]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput(""); push({ role: "user", text: message }); setBusy("ask");
    try {
      const reply = await ask({ data: { message, context } });
      if (reply.ok) { push({ role: "assistant", text: reply.text, ...(reply.offer ? { offer: reply.offer } : {}) }); setContext(reply.context); setSimple(reply.mode === "simple"); }
      else push({ role: "assistant", text: reply.error });
    } catch { push({ role: "assistant", text: "Je n’ai pas pu répondre. Réessayez dans un instant." }); }
    finally { setBusy(null); }
  }

  async function reserve(offer: NonNullable<Message["offer"]>) {
    setBusy("book");
    try {
      const result = await book({ data: { tripId: offer.tripId, date: offer.date, arrival: offer.arrival, origin: offer.origin } });
      if (result.ok) push({ role: "assistant", text: `Place réservée pour ${result.priceDh} DH. Rendez-vous à ${formatInTimeZone(result.pickupTime, "Africa/Casablanca", "HH:mm")}.`, bookingId: result.bookingId });
      else push({ role: "assistant", text: result.error });
    } catch { push({ role: "assistant", text: "La réservation n’a pas abouti. Réessayez dans un instant." }); }
    finally { setBusy(null); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void send(input); }

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-5 py-8">
        <h2 className="font-display text-2xl font-bold">Rafiq IA</h2>
        {!account.ready && <p className="text-sm text-muted-foreground" role="status">Chargement…</p>}
        {account.ready && !account.email && <p className="text-sm">Connectez-vous avec votre adresse étudiante pour discuter avec Rafiq IA. <Button asChild variant="link" className="px-1"><Link to="/auth">Connexion</Link></Button></p>}
        {account.email && (
          <>
            <ol className="space-y-3" aria-label="Conversation" aria-live="polite">
              {messages.map(message => (
                <li key={message.id} className={message.role === "user" ? "ms-10 rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground" : "me-10 rounded-2xl border bg-card px-4 py-3 text-sm"}>
                  <p>{message.text}</p>
                  {message.offer && <Button variant="cta" size="sm" className="mt-3" disabled={busy !== null} onClick={() => reserve(message.offer!)}>{busy === "book" ? <LoaderCircle className="animate-spin" /> : <CircleCheck />}Réserver · {message.offer.priceDh} DH</Button>}
                  {message.bookingId && <Button asChild variant="link" className="mt-1 h-auto px-0"><Link to="/trajet/$bookingId" params={{ bookingId: message.bookingId }}>Suivre le trajet</Link></Button>}
                </li>
              ))}
              {busy === "ask" && <li className="me-10 flex items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground" role="status"><LoaderCircle className="animate-spin" />Je cherche…</li>}
            </ol>
            <div ref={end} />
            <div className="flex flex-wrap gap-2">{EXAMPLES.map(example => <Button key={example} type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => send(example)}>{example}</Button>)}</div>
            <form onSubmit={submit} className="flex gap-2">
              <input aria-label="Votre message" maxLength={500} placeholder="Écrivez comme à un ami…" className="h-12 min-w-0 flex-1 rounded-xl border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={input} onChange={event => setInput(event.target.value)} />
              <Button type="submit" size="icon" aria-label="Envoyer" disabled={busy !== null || input.trim() === ""}><Send /></Button>
            </form>
            <p className="text-xs text-muted-foreground">Rafiq IA cherche un trajet pour arriver avant l’heure indiquée, avec un rendez-vous à 200 m maximum. Il ne prévient pas encore le conducteur en cas de pluie.{simple ? " Mode simple : l’assistant comprend les phrases courtes." : ""}</p>
          </>
        )}
      </div>
    </main>
  );
}
