import Image from "next/image";
import Link from "next/link";
import {
  CalendarCheckIcon,
  DashboardIcon,
  UsersIcon,
} from "@/components/icons";

const FEATURES = [
  {
    title: "Registro unico",
    description:
      "Un solo profilo \"Persona\" per studenti e istruttori: nel BJJ la stessa persona spesso è entrambe le cose insieme.",
    icon: UsersIcon,
  },
  {
    title: "Presenze e ore",
    description:
      "Presente/assente per data, con chi ha condotto la lezione. Il conteggio ore è automatico.",
    icon: CalendarCheckIcon,
  },
  {
    title: "Criteri di promozione",
    description:
      "Soglie di ore e tempo al grado configurabili per cintura e grado — mai automatiche.",
    icon: DashboardIcon,
  },
] as const;

const NOT_DOING = [
  "Pagamenti, abbonamenti, fatturazione",
  "Iscrizioni online / gestione lead",
  "Gestione competizioni/tornei",
  "Tracciamento tecnico per categoria posizionale",
];

export default function Home() {
  return (
    <div className="flex flex-col gap-10 sm:gap-16">
      <section className="flex flex-col gap-4 sm:gap-5">
        <div className="w-fit rounded-lg bg-secondary p-3 sm:p-4">
          <Image
            src="/faixabjj_logo-removebg-preview.png"
            alt="FAIXA BJJ"
            width={618}
            height={404}
            priority
            className="h-12 w-auto sm:h-20"
          />
        </div>
        <span className="w-fit rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
          In design / MVP in sviluppo
        </span>
        <h1 className="max-w-xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
          La progressione tecnica, tracciata — non decisa a sensazione.
        </h1>
        <p className="max-w-lg text-base leading-relaxed text-foreground/70">
          FAIXABJJ affianca il gestionale che usi già in palestra e copre
          quello che gli strumenti generici fanno male: seguire il percorso
          di ogni studente verso gradi e cinture, con un modello dati che
          aggiunge il minimo indispensabile di lavoro per gli istruttori.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/registro"
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Apri il registro
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-neutral-light/50"
          >
            Vedi la dashboard
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        {FEATURES.map(({ title, description, icon: Icon }) => (
          <div
            key={title}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 sm:gap-3 sm:p-5"
          >
            <Icon className="h-6 w-6 text-accent" />
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="text-sm leading-relaxed text-foreground/65">
              {description}
            </p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-6 sm:pt-8">
        <h2 className="text-sm font-semibold text-foreground/60">
          Cosa non fa, deliberatamente
        </h2>
        <ul className="grid gap-2 text-sm text-foreground/65 sm:grid-cols-2">
          {NOT_DOING.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
