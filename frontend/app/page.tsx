import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  CalendarCheckIcon,
  CheckCircleIcon,
  DashboardIcon,
  UsersIcon,
} from "@/components/icons";
import { SITE_NAME, SITE_URL } from "@/utils/site";

// The landing page has its own title rather than inheriting the template:
// "FAIXABJJ — ..." reads better as a search result than "Home · FAIXABJJ".
export const metadata: Metadata = {
  title: "FAIXABJJ - gestione ore, gradi e cinture per palestre di BJJ",
  description:
    "Software per scuole di Brazilian Jiu-Jitsu: registro unico di allievi e istruttori, presenze e conteggio ore automatico, criteri di promozione a gradi e cinture. La decisione resta all'istruttore.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    title: "FAIXABJJ - gestione ore, gradi e cinture per palestre di BJJ",
    description:
      "Registro unico, presenze con conteggio ore automatico e criteri di promozione configurabili, per scuole di Brazilian Jiu-Jitsu.",
  },
};

const FEATURES = [
  {
    title: "Registro unico",
    description:
      "Un solo profilo per allievi e istruttori: nel BJJ la stessa persona è spesso entrambe le cose insieme, e il ruolo cambia nel tempo senza perdere lo storico.",
    icon: UsersIcon,
  },
  {
    title: "Presenze e ore",
    description:
      "Appello dell'istruttore o check-in dell'allievo, dentro una finestra attorno alla lezione. Ogni presenza vale un'ora e il totale si aggiorna da solo.",
    icon: CalendarCheckIcon,
  },
  {
    title: "Criteri di promozione",
    description:
      "Soglie di ore e di tempo al grado, configurabili per cintura. Il sistema segnala chi è pronto: promuovere resta una decisione dell'istruttore.",
    icon: DashboardIcon,
  },
] as const;

const STEPS = [
  {
    title: "Definisci i corsi",
    description:
      "Giorni, orario e periodo di ogni corso ricorrente. Da lì nasce il calendario delle lezioni, senza reinserire niente ogni settimana.",
  },
  {
    title: "Registra le presenze",
    description:
      "L'istruttore fa l'appello in pochi tocchi dal telefono, oppure è l'allievo a fare check-in quando arriva in palestra.",
  },
  {
    title: "Guarda chi è pronto",
    description:
      "Ore accumulate e tempo trascorso al grado attuale, per ogni persona, sempre visibili accanto al nome.",
  },
] as const;

const NOT_DOING = [
  "Pagamenti, abbonamenti e fatturazione",
  "Iscrizioni online e gestione dei contatti",
  "Gestione di competizioni e tornei",
  "Tracciamento tecnico per categoria posizionale",
];

// Structured data, so a search engine can read what this is without inferring
// it from the copy. Kept minimal and truthful: no invented ratings or prices.
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "it-IT",
  url: SITE_URL,
  description:
    "Software per scuole di Brazilian Jiu-Jitsu: registro unico di allievi e istruttori, presenze con conteggio ore automatico e criteri di promozione a gradi e cinture.",
  audience: {
    "@type": "Audience",
    audienceType: "Scuole e palestre di Brazilian Jiu-Jitsu",
  },
};

export default function Home() {
  return (
    <div className="flex flex-col gap-12 sm:gap-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      <section className="flex flex-col gap-5 sm:gap-6">
        {/* The logo is black artwork on transparency, so it needs a light
            plate to survive the dark theme. `bg-secondary` is fixed light in
            both themes on purpose — this is one of the few places where a
            brand colour is used as itself rather than as a role. */}
        <div className="w-fit rounded-lg border border-border bg-secondary p-3 sm:p-4">
          <Image
            src="/logo/faixabjj_logo-removebg-preview.png"
            alt="FAIXA BJJ"
            width={618}
            height={404}
            priority
            className="h-12 w-auto sm:h-20"
          />
        </div>

        <span className="w-fit rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
          MVP in sviluppo
        </span>

        <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
          La progressione tecnica tracciata.
        </h1>

        {/* ~65 characters per line, per the brand guidelines. */}
        <p className="max-w-prose text-base leading-relaxed text-foreground/70">
          FAIXABJJ affianca il gestionale che la palestra usa già e copre
          l&apos;unica cosa che gli strumenti generici fanno male: seguire il
          percorso di ogni allievo verso gradi e cinture, aggiungendo il minimo
          indispensabile di lavoro agli istruttori.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {/* Both buttons used to point at pages behind the login, which sent
              every visitor straight to a login form. This page is for people
              who are not signed in: the only honest action here is signing in. */}
          <Link
            href="/login"
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Accedi al portale
          </Link>
          <Link
            href="#come-funziona"
            className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            Come funziona
          </Link>
        </div>

        <p className="text-xs text-foreground/50">
          L&apos;accesso è riservato ai membri della palestra: gli account li
          crea la segreteria, non esiste registrazione libera.
        </p>
      </section>

      <section className="flex flex-col gap-4 sm:gap-6">
        <h2 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
          Cosa fa
        </h2>
        <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          {FEATURES.map(({ title, description, icon: Icon }) => (
            <article
              key={title}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 sm:gap-3 sm:p-5"
            >
              <Icon className="h-6 w-6 text-accent" />
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-foreground/65">
                {description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section id="come-funziona" className="flex scroll-mt-20 flex-col gap-4 sm:gap-6">
        <h2 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
          Come funziona
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 sm:gap-3 sm:p-5"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 font-heading text-sm font-bold text-accent">
                {index + 1}
              </span>
              <h3 className="text-base font-semibold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-foreground/65">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:gap-5 sm:p-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
            Cosa non fa, deliberatamente
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-foreground/60">
            Non è un gestionale completo e non vuole diventarlo. Sta accanto a
            quello che la palestra usa già, e copre bene una cosa sola.
          </p>
        </div>
        <ul className="grid gap-2 text-sm text-foreground/70 sm:grid-cols-2">
          {NOT_DOING.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col items-start gap-3 border-t border-border pt-8 sm:pt-10">
        <h2 className="flex items-center gap-2 font-heading text-xl font-bold tracking-tight sm:text-2xl">
          <CheckCircleIcon className="h-5 w-5 shrink-0 text-accent" />
          Sei già un membro?
        </h2>
        <p className="max-w-prose text-sm leading-relaxed text-foreground/65">
          Entra con l&apos;email che hai dato in palestra. Se non ricordi la
          password puoi reimpostarla dalla pagina di accesso.
        </p>
        <Link
          href="/login"
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Accedi
        </Link>
      </section>
    </div>
  );
}
