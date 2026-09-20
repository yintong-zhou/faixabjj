// Italian is the source of truth: its shape defines the `Dictionary` type that
// the other two languages must satisfy, so a missing or renamed key is a
// compile error rather than a string that silently falls back to Italian.
//
// Values are plain strings, or functions where a value has to be interpolated
// or pluralised. Functions rather than a `{count}` placeholder parser: they
// cost nothing, they are type-checked at the call site, and they let each
// language pluralise in its own way instead of forcing a shared format.

export const it = {
  common: {
    save: "Salva",
    saveChanges: "Salva modifiche",
    cancel: "Annulla",
    back: "Indietro",
    none: "Nessuno",
    all: "Tutti",
    today: "Oggi",
    dash: "—",
    open: "Apri",
    close: "Chiudi",
    details: "Dettagli",
    readOnly: "Sola lettura",
    notAvailable: "Non disponibile",
    loading: "Caricamento…",
  },

  nav: {
    home: "Home",
    dashboard: "Dashboard",
    presenze: "Presenze",
    corsi: "Corsi",
    registro: "Registro",
    account: "Account",
    signIn: "Accedi",
    signOut: "Esci",
    menu: "Menu",
    theme: { toLight: "Passa al tema chiaro", toDark: "Passa al tema scuro" },
    language: "Lingua",
    privacy: "Privacy e cookie",
  },

  belts: {
    white: "Bianca",
    // Le dodici cinture dei corsi bambini e ragazzi (IBJJF, 4-15 anni). Ogni
    // gruppo di colore ha tre gradi: bianca, piena, nera.
    gray_white: "Grigia/Bianca",
    gray: "Grigia",
    gray_black: "Grigia/Nera",
    yellow_white: "Gialla/Bianca",
    yellow: "Gialla",
    yellow_black: "Gialla/Nera",
    orange_white: "Arancione/Bianca",
    orange: "Arancione",
    orange_black: "Arancione/Nera",
    green_white: "Verde/Bianca",
    green: "Verde",
    green_black: "Verde/Nera",
    blue: "Blu",
    purple: "Viola",
    brown: "Marrone",
    black: "Nera",
    // The alt text of the drawn belt: it replaced the words, so it has to say
    // exactly what the words said.
    label: (belt: string, stripes: number) =>
      stripes <= 0
        ? `Cintura ${belt.toLowerCase()}`
        : `Cintura ${belt.toLowerCase()}, ${stripes} tacc${stripes === 1 ? "a" : "he"}`,
  },

  roles: {
    student: "Allievo",
    assistant: "Assistente",
    instructor: "Istruttore",
    head_coach: "Maestro",
    admin: "Admin",
  },

  dates: {
    days: (n: number) =>
      `${new Intl.NumberFormat("it-IT").format(n)} giorn${n === 1 ? "o" : "i"}`,
    weekdayShort: ["lun", "mar", "mer", "gio", "ven", "sab", "dom"],
    weekdayLong: [
      "lunedì",
      "martedì",
      "mercoledì",
      "giovedì",
      "venerdì",
      "sabato",
      "domenica",
    ],
  },

  auth: {
    signInTitle: "Accedi",
    signInLead: "Area riservata ai membri della palestra.",
    email: "Email",
    password: "Password",
    forgotLink: "Password dimenticata?",
    signInButton: "Accedi",
    wrongCredentials: "Email o password non corrette.",
    // Il controllo antibot ha rifiutato la richiesta. Volutamente vago su cosa
    // sia andato storto: chi lo legge in buona fede deve solo riprovare.
    captchaFailed:
      "Verifica di sicurezza non riuscita. Ricarica la pagina e riprova.",

    forgotTitle: "Password dimenticata",
    forgotLead:
      "Inserisci la tua email: se l'account esiste, ti mandiamo un link per reimpostare la password.",
    forgotButton: "Invia link",
    backToLogin: "Torna al login",
    sentTitle: "Controlla la tua email",
    sentLead:
      "Se l'indirizzo è registrato, riceverai a breve un link per reimpostare la password.",

    changeTitleForced: "Scegli la tua password",
    changeTitle: "Cambia password",
    changeLeadForced:
      "Il tuo account è stato creato con una password provvisoria, uguale per tutti. Scegline una tua per continuare: fino ad allora il resto dell'app resta chiuso.",
    changeLead: "Imposta una nuova password per il tuo account.",
    newPassword: "Nuova password",
    confirmPassword: "Conferma password",
    passwordHint: "Almeno 8 caratteri, e diversa da quella provvisoria.",
    changeButton: "Salva e continua",
    tooShort: "La password deve avere almeno 8 caratteri.",
    mismatch: "Le due password non coincidono.",
    sameAsDefault: "Scegli una password diversa da quella predefinita.",
    updateFailed: "Non è stato possibile aggiornare la password.",
    flagNotCleared:
      "Password aggiornata, ma la richiesta di cambio non è stata azzerata. Riprova.",

    showPassword: "Mostra la password",
    hidePassword: "Nascondi la password",
  },

  reset: {
    checkingTitle: "Reimposta password",
    checkingLead: "Verifica del link in corso…",
    invalidTitle: "Link non valido",
    invalidLead:
      "Questo link per reimpostare la password non è valido o è scaduto.",
    requestNewLink: "Richiedi un nuovo link",
    doneTitle: "Password aggiornata",
    doneLead: "Ti sto reindirizzando…",
    title: "Scegli una nuova password",
    lead: "Minimo 6 caratteri.",
    saveButton: "Salva password",
    updateFailed:
      "Non è stato possibile aggiornare la password. Richiedi un nuovo link.",
  },

  home: {
    metaTitle: "Faixa BJJ - gestione ore, gradi e cinture per palestre di BJJ",
    metaDescription:
      "Software per scuole di Brazilian Jiu-Jitsu: registro unico di allievi e istruttori, presenze e conteggio ore automatico, criteri di promozione a gradi e cinture. La decisione resta all'istruttore.",
    ogDescription:
      "Registro unico, presenze con conteggio ore automatico e criteri di promozione configurabili, per scuole di Brazilian Jiu-Jitsu.",
    badge: "MVP in sviluppo",
    title: "La progressione tecnica tracciata.",
    lead: "Faixa BJJ affianca il gestionale che la palestra usa già e copre l'unica cosa che gli strumenti generici fanno male: seguire il percorso di ogni allievo verso gradi e cinture, aggiungendo il minimo indispensabile di lavoro agli istruttori.",
    ctaPrimary: "Accedi al portale",
    ctaSecondary: "Come funziona",
    noSignup:
      "L'accesso è riservato ai membri della palestra: gli account li crea la segreteria, non esiste registrazione libera.",

    keywords: [
      "Brazilian Jiu-Jitsu",
      "BJJ",
      "gestione palestra BJJ",
      "registro presenze BJJ",
      "conteggio ore allenamento",
      "gradi e cinture",
      "promozione cintura BJJ",
    ],
    audience: "Scuole e palestre di Brazilian Jiu-Jitsu",
    whatItDoes: "Cosa fa",
    features: [
      {
        title: "Registro unico",
        description:
          "Un solo profilo per allievi e istruttori: nel BJJ la stessa persona è spesso entrambe le cose insieme, e il ruolo cambia nel tempo senza perdere lo storico.",
      },
      {
        title: "Presenze e ore",
        description:
          "Appello dell'istruttore o check-in dell'allievo, dentro una finestra attorno alla lezione. Ogni presenza vale un'ora e il totale si aggiorna da solo.",
      },
      {
        title: "Criteri di promozione",
        description:
          "Soglie di ore e di tempo al grado, configurabili per cintura. Il sistema segnala chi è pronto: promuovere resta una decisione dell'istruttore.",
      },
    ],

    howItWorks: "Come funziona",
    steps: [
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
    ],

    notDoingTitle: "Cosa non fa, deliberatamente",
    notDoingLead:
      "Non è un gestionale completo e non vuole diventarlo. Sta accanto a quello che la palestra usa già, e copre bene una cosa sola.",
    notDoing: [
      "Pagamenti, abbonamenti e fatturazione",
      "Iscrizioni online e gestione dei contatti",
      "Gestione di competizioni e tornei",
      "Tracciamento tecnico per categoria posizionale",
    ],

    alreadyMember: "Sei già un membro?",
    alreadyMemberLead:
      "Entra con l'email che hai dato in palestra. Se non ricordi la password puoi reimpostarla dalla pagina di accesso.",
  },

  account: {
    title: "Il mio account",
    lead: "Gestisci i tuoi dati personali e le credenziali di accesso.",
    profileUnavailable:
      "Il tuo profilo non è disponibile. Se il problema persiste, controlla che le migration del database siano state applicate.",

    personalData: "Dati personali",
    fullName: "Nome e cognome",
    phone: "Telefono",
    birthDate: "Data di nascita",
    notes: "Note",
    emailChangeNote:
      "Cambiando indirizzo riceverai una email di conferma: il nuovo indirizzo diventa attivo solo dopo averla aperta.",

    rankAndRoles: "Grado e ruoli",
    rankReadOnly:
      "Cintura, tacche e ruoli non sono modificabili da qui: la promozione resta una decisione dell'istruttore.",
    openingBalanceNote: (perWeek: number) =>
      `Le ore includono un saldo di partenza, stimato a ${perWeek} lezioni a settimana per il periodo prima del tracciamento. Da lì in poi crescono solo con il tuo check-in o con l'appello dell'istruttore.`,
    belt: "Cintura",
    beltSince: "Cambio cintura da",
    stripeSince: "Ultima tacca",
    joinedOn: "Iscritto dal",
    classHours: "Ore di lezione",
    activeRoles: "Ruoli attivi",
    manageMembers: "Gestisci i membri dal Registro →",

    passwordSection: "Password",
    updatePassword: "Aggiorna password",
    passwordMinimum: "Almeno 8 caratteri.",
    estimateSuffix: "(stima)",
  },

  dashboard: {
    title: "Dashboard",
    staffLead:
      "Il quadro della palestra: allievi, lezioni del mese e distribuzione delle cinture.",
    memberLead: "Il tuo percorso: grado, ore di lezione e prossimi allenamenti.",
    // Le due viste del controllo segmentato, visibile solo a chi ha entrambe:
    // un allievo non ha niente fra cui scegliere.
    viewGym: "Palestra",
    viewMine: "Il mio percorso",
    profileUnavailable:
      "Il tuo profilo non è disponibile. Se il problema persiste, avvisa la segreteria della palestra.",

    students: "Allievi",
    activeMembers: "Membri attivi",
    ofTotal: (n: number) => `${n} in totale`,
    newMembers: (days: number) => `Nuovi (${days} gg)`,
    recentlyJoined: "iscritti di recente",
    withoutAccount: "Senza account",
    neverInvited: "mai invitati o revocati",
    gymHours: "Ore della palestra",
    openingBalancesIncluded: "saldi iniziali inclusi",

    monthLessons: "Lezioni del mese",
    scheduled: "In calendario",
    activeCourses: (n: number) => `${n} corsi attivi`,
    held: "Già svolte",
    cancelledCount: (n: number) => `${n} annullate`,
    attendances: "Presenze",
    recordedThisMonth: "registrate questo mese",
    averagePerLesson: "Media per lezione",
    studentsPresent: "allievi presenti",
    todayHeading: "Oggi",
    noLessonsToday: "Nessuna lezione in programma oggi.",
    noInstructor: "nessun istruttore",
    presentCount: (n: number) => `${n} presenti`,
    rollCall: "Appello",

    belts: "Cinture",
    beltSpread: (n: number) => `Distribuzione fra i ${n} membri attivi.`,
    unknownBelts: (n: number) =>
      `${n} membri hanno una cintura non riconosciuta e non compaiono nel grafico.`,

    yourRank: "Il tuo grado",
    atThisBelt: "Con questa cintura",
    sinceLastStripe: "Dall'ultima tacca",
    promotionNote:
      "Cintura e tacche le assegna il tuo istruttore: qui vedi solo lo stato attuale, la promozione non è mai automatica.",

    yourTraining: "Il tuo allenamento",
    totalHours: "Ore totali",
    openingBalanceIncluded: "saldo iniziale incluso",
    recordedHours: "ore registrate",
    lastDays: (days: number) => `Ultimi ${days} gg`,
    lessonsDone: "lezioni fatte",
    average: "Media",
    lessonsPerWeek: "lezioni a settimana",
    lastTime: "Ultima volta",
    noneInWindow: (days: number) => `nessuna negli ultimi ${days} gg`,
    memberEstimateNote: (perWeek: number) =>
      `Il totale include un saldo di partenza, stimato a ${perWeek} lezioni a settimana per il periodo prima del tracciamento. Da lì in poi cresce solo con il tuo check-in o con l'appello dell'istruttore.`,

    nextLessons: "Prossime lezioni",
    noUpcoming: "Nessuna lezione in calendario nei prossimi giorni.",
    checkinHint:
      "Il check-in si fa da Presenze, quando sei in palestra e la finestra è aperta.",
  },

  presenze: {
    title: "Presenze",
    staffLead: "Le lezioni in calendario. Apri una lezione per fare l'appello.",
    memberLead:
      "Le lezioni in calendario. Fai il check-in quando sei in palestra: ogni presenza vale un'ora.",
    loadFailed:
      "Non è stato possibile caricare il calendario. Controlla che le migration del database siano state applicate.",
    profileMissing: "Il tuo profilo non è disponibile, quindi il check-in è disattivato.",

    viewList: "Lista",
    viewGrid: "Griglia",
    weekOf: (date: string) => `Settimana del ${date}`,
    previousWeek: "Prima",
    nextWeek: "Dopo",
    previousMonth: "Mese prima",
    nextMonth: "Mese dopo",
    todaySuffix: " · oggi",

    noLessonsThisWeek: "Nessuna lezione in questa settimana.",
    noLessonsThisDay: "Nessuna lezione in questo giorno.",
    cellRollCall: (course: string) => `Appello: ${course}`,
    cellOpenDay: (n: number) => `${n} lezioni — apri il giorno`,

    noInstructor: "nessun istruttore",
    cancelledSuffix: " · lezione annullata",
    presentCount: (n: number) => `${n} presenti`,
    rollCall: "Appello",

    absent: "assente",
    present: "Presente",
    undo: "Annulla",
    cancelledState: "annullata",
    tooEarly: "check-in non ancora aperto",
    closed: "check-in chiuso",
    openState: "check-in aperto",
    checkIn: "Check-in",
  },

  rollCall: {
    notRecorded: "Non registrato",
    present: "Presente",
    absent: "Assente",
    presentTotal: (n: number) => `${n} present${n === 1 ? "e" : "i"}`,
    cancelledNotice:
      "Lezione annullata: il check-in è chiuso. Le presenze già registrate restano.",
    lessonSection: "Lezione",
    instructor: "Istruttore",
    restoreLesson: "Ripristina lezione",
    cancelLesson: "Annulla lezione",
    cancelConfirm:
      "Annullare questa lezione? Il check-in si chiude, ma le presenze già registrate restano.",
    courseSuspendedNotice:
      "Corso sospeso: il check-in è chiuso e le prossime lezioni non compaiono in calendario. Le presenze già registrate restano.",
    selfCheckinTag: "check-in",
    selfCheckins: (n: number) =>
      `${n} ${n === 1 ? "persona ha" : "persone hanno"} fatto check-in da sola: controlla prima di salvare.`,
    instructorTag: "istruttore",
    noMembers: "Nessun membro nel registro.",
    saveRollCall: "Salva appello",
  },

  registro: {
    title: "Registro",
    leadEditor:
      "Panoramica di tutti i membri della palestra. Da qui aggiungi una persona e gestisci i suoi accessi.",
    leadReadOnly:
      "Panoramica di tutti i membri della palestra. Con il tuo ruolo di istruttore la sezione è in sola lettura.",
    loadFailed:
      "Non è stato possibile caricare il registro. Controlla che le migration del database siano state applicate.",

    addPerson: "Aggiungi persona",
    addToRegistry: "Aggiungi al registro",
    defaultPasswordNoteBefore:
      "Viene creato anche l'account, subito attivo e senza email di conferma. Password provvisoria:",
    defaultPasswordNoteAfter:
      "— comunicala alla persona. Al primo accesso le verrà chiesto di sostituirla prima di poter usare il resto dell'app.",
    select: "Seleziona…",
    stripes: "Tacche",
    todayIfEmpty: "(oggi se vuoto)",
    role: "Ruolo",

    filters: "Filtri",
    name: "Nome",
    searchByName: "Cerca per nome",
    onlyActive: "Solo membri attivi",
    onlyActiveChip: "solo attivi",
    filter: "Filtra",
    reset: "Azzera",

    noneFound: "Nessun membro trovato.",
    countAndPage: (total: number, page: number, pages: number) =>
      `${total} membr${total === 1 ? "o" : "i"} · pagina ${page} di ${pages}`,
    noMatch: "Nessun membro corrisponde ai filtri scelti.",
    previous: "Precedente",
    next: "Successiva",

    noAccount: "senza account",
    trainingFor: (days: string) => `${days} di BJJ`,
    atCurrentBelt: (days: string) => `${days} con la cintura attuale`,
    noActiveRole: "Nessun ruolo attivo",
    memberSince: " · dal ",
    estimateSuffix: " (stima)",

    rowActions: (name: string) => `Azioni per ${name}`,
    details: "Dettagli",
    invite: "Invita al portale",
    resetPassword: "Reimposta password",
    resetPasswordConfirm: (name: string) =>
      `Reimpostare la password di ${name} su quella provvisoria? La password attuale smetterà di funzionare.`,
    revoke: "Revoca accesso",
    revokeConfirm: (name: string) =>
      `Revocare l'accesso a ${name}? La scheda resta nel registro, ma la persona non potrà più entrare nel portale.`,

    backToRegistry: "Registro",
    detailReadOnly:
      "Sola lettura: con il tuo ruolo di istruttore la scheda non è modificabile.",
    personalSection: "Anagrafica",
    pathSection: "Percorso",
    correctDates: "Correggi le date",
    correctDatesNote:
      "Serve a correggere una data sbagliata, non a promuovere: non registra nessuna promozione e non cambia cintura né tacche. Da qui dipende il calcolo dell'idoneità, quindi vale la pena che siano giuste.",
    notesSection: "Note",
    rolesSection: "Ruoli",
    noRoles: "Nessun ruolo assegnato.",
    roleRange: (from: string, to: string) => `dal ${from} al ${to}`,
    roleOpen: (from: string) => `dal ${from} · attivo`,
    totalHours: "Ore totali",
    recordedHours: "Ore registrate",
    openingHours: "Ore iniziali (stima)",
    trainingTime: "Da quanto fa BJJ",
    beltTime: "Da quanto ha questa cintura",
    stripeTime: "Dall'ultima tacca",
    openingBalanceExplained: (date: string, perWeek: number) =>
      `Le ore iniziali coprono il solo periodo dall'iscrizione al ${date}, calcolate a ${perWeek} lezioni a settimana perché per quegli anni non esiste uno storico delle presenze. Sono un saldo di partenza e non crescono più: dal ${date} ogni ora arriva soltanto dal check-in dell'allievo o dall'appello dell'istruttore.`,
  },

  msg: {
    genericFailed: "Operazione non riuscita.",
    alreadyPresent: "Risulti già presente a questa lezione.",
    undoTooLate: "Non è più possibile annullare questo check-in.",
    checkinFailed:
      "Non è stato possibile registrare il check-in. Riprova; se continua, avvisa l’istruttore.",
    undoFailed:
      "Non è stato possibile annullare il check-in. Riprova; se continua, avvisa l’istruttore.",
    restoreFailed: "Ripristino non riuscito.",
    pickBelt: "Seleziona una cintura.",
    pickRole: "Seleziona un ruolo.",
    emailNeededToInvite:
      "Serve un indirizzo email sulla scheda per invitare questa persona.",
    resetFailed: "Reimpostazione non riuscita.",
    cannotRevokeSelf: "Non puoi revocare il tuo stesso accesso.",
    revokeFailed: "Revoca non riuscita.",
    // account
    nameEmpty: "Il nome non può essere vuoto.",
    profileNotFound: "Profilo non trovato.",
    profileSaveFailed: "Non è stato possibile salvare il profilo.",
    profileSaved: "Profilo aggiornato.",
    profileSavedEmailPending:
      "Profilo salvato. Conferma il nuovo indirizzo dal link che ti abbiamo inviato per email.",
    profileSavedEmailFailed: "Profilo salvato, ma il cambio email non è riuscito.",
    passwordUpdated: "Password aggiornata.",
    profileUnavailable: "Il tuo profilo non è disponibile.",

    // registro
    nameRequired: "Il nome è obbligatorio.",
    emailRequired: "L'email è obbligatoria.",
    joinDateRequired: "La data di iscrizione è obbligatoria.",
    stripesRange: "Le tacche devono essere un numero da 0 a 4.",
    userNotSpecified: "Utente non specificato.",
    adminClientMissing: "Client di amministrazione non disponibile.",
    secretMissingCreate:
      "SUPABASE_SECRET_KEY non è configurata: non è possibile creare account.",
    secretMissingInvite: "SUPABASE_SECRET_KEY non è configurata: gli inviti sono disattivati.",
    secretMissingReset: "SUPABASE_SECRET_KEY non è configurata: il reset è disattivato.",
    secretMissingRevoke: "SUPABASE_SECRET_KEY non è configurata: la revoca è disattivata.",
    accountNotCreated:
      "Account non creato: l'indirizzo email potrebbe essere già registrato.",
    personAdded: (name: string, password: string) =>
      `${name} aggiunta al registro. Account attivo: password provvisoria ${password}, da cambiare al primo accesso.`,
    personAddedNoRole: (name: string) =>
      `${name} è stata aggiunta, ma il ruolo non è stato assegnato.`,
    accountCreatedNoProfile: (email: string) =>
      `Account creato per ${email}, ma i dati della scheda non sono stati salvati.`,
    inviteFailed: "Invito non riuscito. L'indirizzo potrebbe essere già registrato.",
    inviteSent: (email: string) => `Invito inviato a ${email}.`,
    passwordReset: (who: string, password: string) =>
      `Password di ${who} riportata a quella provvisoria (${password}): le verrà chiesto di cambiarla al primo accesso.`,
    someUser: "l'utente",
    accessRevoked: "Accesso revocato. La scheda resta nel registro.",

    // corsi
    courseNameRequired: "Il nome del corso è obbligatorio.",
    timesRequired: "Orario di inizio e di fine sono obbligatori.",
    endBeforeStart: "L'orario di fine deve essere dopo quello di inizio.",
    pickOneDay: "Scegli almeno un giorno della settimana.",
    opensRange: "I minuti di apertura del check-in devono stare fra 0 e 1440.",
    closesRange: "I minuti di chiusura del check-in devono stare fra 0 e 1440.",
    endDateBeforeStart: "La data di fine deve essere dopo quella di inizio.",
    courseNotCreated: "Corso non creato.",
    courseNotSpecified: "Corso non specificato.",
    courseNotFound: "Corso non trovato.",
    courseUpdateFailed: "Modifica non riuscita.",
    courseCreated: (name: string, lessons: number) =>
      `${name} creato, ${lessons} lezioni in calendario.`,
    courseCreatedNoCalendar: (name: string) =>
      `${name} creato, ma il calendario non è stato generato.`,
    courseUpdated: (name: string) => `${name} aggiornato e calendario rigenerato.`,
    courseUpdatedNoCalendar: "Corso aggiornato, ma il calendario non è stato rigenerato.",
    calendarExtended: (name: string, lessons: number) =>
      `Calendario di ${name} esteso a ${lessons} lezioni.`,
    calendarNotExtended: "Calendario non esteso.",
    courseSuspended: "Corso sospeso.",
    courseReactivated: "Corso riattivato.",
    courseDeleted: "Corso eliminato.",
    courseHasAttendance: "Il corso ha presenze registrate: puoi solo sospenderlo.",
    deleteFailed: "Eliminazione non riuscita.",

    // presenze
    sessionNotSpecified: "Lezione non specificata.",
    checkinClosed: "Il check-in per questa lezione non è aperto.",
    checkinRecorded: "Check-in registrato.",
    checkinUndone: "Check-in annullato.",
    rollCallSaved: (present: number) => `Appello salvato: ${present} presenti.`,
    rollCallSavedKept: (present: number, kept: number) =>
      `Appello salvato: ${present} presenti. ${kept} check-in ${kept === 1 ? "arrivato" : "arrivati"} dopo l’apertura dell’appello ${kept === 1 ? "è stato mantenuto" : "sono stati mantenuti"}.`,
    rollCallPartial: "Appello salvato solo in parte.",
    rollCallFailed: "Appello non salvato.",
    instructorUpdated: "Istruttore aggiornato.",
    instructorNotUpdated: "Istruttore non aggiornato.",
    lessonCancelled: "Lezione annullata.",
    lessonRestored: "Lezione ripristinata.",
    cancelFailed: "Annullamento non riuscito.",

    promotionRecorded: "Promozione registrata",
    promotionFailed: "Non è stato possibile registrare la promozione",
    promotionNotForward: "Una promozione deve andare avanti, non indietro",
    datesSaved: "Date del percorso aggiornate",
    datesFailed: "Non è stato possibile aggiornare le date",
    dateInFuture: "Una data non può essere nel futuro",
    stripeBeforeBelt:
      "L'ultima tacca non può essere precedente al cambio di cintura",
    criterionSaved: "Criterio aggiornato",
    criterionFailed: "Non è stato possibile salvare il criterio",
  },

  corsi: {
    noDays: "nessun giorno",
    title: "Corsi",
    lead:
      "I corsi ricorrenti della palestra. Da qui nasce il calendario delle lezioni che trovi in Presenze.",
    loadFailed:
      "Non è stato possibile caricare i corsi. Controlla che le migration del database siano state applicate.",

    addCourse: "Aggiungi corso",
    createCourse: "Crea corso",
    addHint:
      "Salvando il corso vengono generate le lezioni delle prossime otto settimane. Le lezioni già passate non vengono mai toccate. L'istruttore indicato qui è il predefinito: le lezioni generate lo ereditano e resta modificabile sulla singola lezione, dalla pagina dell'appello in Presenze.",

    courseName: "Nome del corso",
    days: "Giorni",
    startTime: "Inizio",
    endTime: "Fine",
    hourAria: (label: string) => `${label}: ore`,
    minuteAria: (label: string) => `${label}: minuti`,
    activeFrom: "Attivo dal",
    todayIfEmpty: "(oggi se vuoto)",
    activeUntil: "Fino al",
    neverEndsIfEmpty: "(senza fine se vuoto)",
    checkinBefore: "Check-in da (min prima)",
    checkinAfter: "Check-in fino a (min dopo)",
    instructor: "Istruttore",
    instructorDefault: "(predefinito del corso)",
    currentInstructor: "Istruttore attuale",
    description: "Descrizione",

    suspended: "sospeso",
    noInstructor: "nessun istruttore",
    noUpcoming: "nessuna lezione futura in calendario",
    upcomingCount: (n: number) => `${n} lezioni in calendario`,
    checkinWindow: (before: number, after: number) =>
      ` · check-in da ${before} min prima a ${after} min dopo`,

    rowActions: (name: string) => `Azioni per ${name}`,
    extendCalendar: "Estendi calendario",
    suspend: "Sospendi",
    reactivate: "Riattiva",
    remove: "Elimina",
    edit: "Modifica",
    deleteConfirm: (name: string) =>
      `Eliminare ${name}? Possibile solo se non ha presenze registrate; altrimenti puoi sospenderlo.`,
    empty:
      "Nessun corso ancora. Creane uno qui sopra: le lezioni compaiono in Presenze subito dopo.",

  },

  hours: {
    hours: (n: string) => `${n} ore`,
    estimateNote: (estimated: string, perWeek: number) =>
      `Include ${estimated} ore iniziali, stimate a ${perWeek} lezioni a settimana dall'iscrizione per il periodo prima del tracciamento. Da allora le ore aumentano solo con il check-in o l'appello.`,
  },

  promotions: {
    queueTitle: "Minimi raggiunti",
    queueIntro:
      "Chi ha raggiunto i minimi di tempo e di ore per il grado successivo. È un suggerimento: la valutazione resta dell'istruttore.",
    queueEmpty: "Nessuno ha raggiunto i minimi al momento.",
    eligibleCount: (n: number) => (n === 1 ? "1 persona" : `${n} persone`),
    hoursNote: "Ore di lezione, calcolate a 1 ora per lezione",
    atCurrentRank: "Ore al grado attuale",
    criteriaTitle: "Criteri",
    // Il titolo della pagina, distinto dall'etichetta del chip sul Registro:
    // quello deve restare corto per stare su una riga del telefono, come
    // t.nav.registro sta a t.registro.title.
    criteriaPageTitle: "Criteri di Graduazione",
    criteriaIntro:
      "Ore e tempo minimi per ogni grado. I valori delle cinture vengono dai minimi IBJJF e dalla pratica comune; quelli delle tacche sono una stima iniziale, da tarare sulla palestra.",
    minHours: "Ore minime",
    minDays: "Giorni minimi",
    minAge: "Età minima",
    criterionNotes: "Note",
    save: "Salva",
    promote: "Promuovi",
    promoteTitle: (name: string) => `Promuovi ${name}`,
    targetBelt: "Nuova cintura",
    targetStripes: "Tacche",
    promotedOn: "Data della promozione",
    promotionNotes: "Note",
    confirm: "Registra promozione",
    history: "Storico promozioni",
    historyEmpty: "Nessuna promozione registrata.",
    historyEntry: (from: string, to: string) => `Da ${from} a ${to}`,
    promotedBy: (name: string) => `Registrata da ${name}`,
    remindersTitle: "Da valutare sul tappeto",
    remindersNote:
      "Promemoria, non una checklist: niente di quanto segue viene salvato.",
    reminders: {
      blue: [
        "Attacco e difesa di base in guardia, montata, cento chili e controllo della schiena",
        "Sopravvive nello sparring senza farsi sottomettere facilmente",
        "Rispetta le regole di sicurezza: batte in tempo, controlla le sottomissioni",
        "Etichetta di base sul tappeto",
        "Rispetto per i compagni di allenamento",
      ],
      purple: [
        "Gioco personale riconoscibile, con posizioni e sequenze preferite",
        "Passaggi di guardia, sottomissioni e transizioni solide",
        "Tiene il confronto con pari grado e con cinture superiori",
        "Costanza negli allenamenti",
        "Affidabilità in palestra",
      ],
      brown: [
        "Gioco tecnico maturo",
        "Concatena le tecniche in modo fluido",
        "Controllo posizionale avanzato",
        "Sa correggere e aiutare le cinture più basse",
        "Contributo attivo alla vita della palestra",
        "Fa da mentore o assiste nell'insegnamento",
      ],
      black: [
        "Adatta il proprio gioco a stili di avversario diversi",
        "È in grado di insegnare l'intero programma",
        "Maturità marziale complessiva",
        "Capacità di guida dimostrata nel tempo",
        "Umiltà e rispetto per la tradizione",
        "Dedizione di lungo periodo all'arte e alla palestra",
      ],
    },
  },

  cookieNotice: {
    text: "Questo sito usa solo cookie tecnici, necessari per tenere la sessione aperta e ricordare la lingua scelta. Nessun cookie di profilazione, nessun servizio di statistiche.",
    more: "Privacy e cookie",
    accept: "Ho capito",
  },

  privacy: {
    title: "Privacy e cookie",
    updated: (date: string) => `Ultimo aggiornamento: ${date}`,
    lead:
      "Questa pagina spiega quali dati personali Faixa BJJ raccoglie, perché, per quanto tempo li conserva e quali diritti hai su di essi.",
    draftTitle: "Documento in bozza",
    draftBody:
      "L'applicazione è in fase di test e il titolare del trattamento non è ancora stato designato. Prima di qualsiasi uso con dati di persone reali vanno compilati nome, sede e contatto del titolare, e vanno verificati i tempi di conservazione indicati qui sotto.",
    sections: [
      {
        heading: "1. Titolare del trattamento",
        paragraphs: [
          "Titolare del trattamento è [NOME DELLA PALESTRA], con sede in [INDIRIZZO COMPLETO], contattabile all'indirizzo [EMAIL DI CONTATTO].",
          "Non è stato nominato un Responsabile della protezione dei dati (DPO): il trattamento non rientra fra i casi in cui l'articolo 37 del GDPR lo rende obbligatorio. Se la palestra decide di nominarlo, i suoi contatti vanno aggiunti qui.",
        ],
      },
      {
        heading: "2. Quali dati trattiamo",
        paragraphs: [
          "Dati di contatto e anagrafici: nome e cognome, email, numero di telefono, data di nascita. Email e nome sono obbligatori per creare un account; telefono e data di nascita sono facoltativi.",
          "Dati di progressione tecnica: cintura, numero di gradi, data dell'ultimo cambio cintura, data dell'ultimo grado, data di iscrizione, ruolo ricoperto in palestra e relativo storico.",
          "Dati di frequenza: presenza o assenza a ciascuna lezione, con l'indicazione se la presenza è stata registrata dall'interessato (check-in) o dall'istruttore (appello).",
          "Note libere: un campo di annotazioni che lo staff può compilare. Non va usato per dati particolari ai sensi dell'articolo 9 del GDPR — in particolare informazioni su salute o infortuni — perché questa informativa non copre quel tipo di trattamento.",
          "Dati di accesso: credenziali gestite dal fornitore di autenticazione (la password è conservata solo come hash, mai in chiaro) e log tecnici del servizio.",
        ],
      },
      {
        heading: "3. Perché trattiamo questi dati e su quale base giuridica",
        paragraphs: [
          "Gestire l'iscrizione e il rapporto con la palestra, registrare le presenze e calcolare le ore di allenamento: esecuzione del contratto o del rapporto associativo di cui l'interessato è parte (art. 6.1.b GDPR).",
          "Valutare l'idoneità a gradi e cinture e tenere lo storico della progressione tecnica: legittimo interesse della palestra a documentare il percorso tecnico dei propri iscritti (art. 6.1.f GDPR). La decisione sulla promozione resta sempre dell'istruttore: l'applicazione non promuove nessuno automaticamente.",
          "Garantire la sicurezza dell'accesso al portale: legittimo interesse a proteggere account e dati (art. 6.1.f GDPR).",
          "Non svolgiamo profilazione né processi decisionali automatizzati che producano effetti giuridici sull'interessato.",
        ],
      },
      {
        heading: "4. Chi può vedere i dati",
        paragraphs: [
          "L'accesso è limitato in base al ruolo, e il limite è applicato dal database stesso, non soltanto dall'interfaccia. Un allievo vede solo i propri dati e il calendario delle lezioni. Un istruttore vede l'elenco dei membri in sola lettura e gestisce corsi e presenze. Maestro e amministratore hanno accesso completo e possono gestire gli account.",
          "Nessun dato viene ceduto o venduto a terzi per finalità di marketing.",
        ],
      },
      {
        heading: "5. Per quanto tempo li conserviamo",
        paragraphs: [
          "I dati di iscrizione e la storia di frequenza sono conservati per tutta la durata del rapporto con la palestra e per [NUMERO] anni successivi, termine da definire in base agli obblighi civilistici e fiscali applicabili.",
          "La revoca dell'accesso al portale cancella le credenziali di accesso ma conserva la scheda della persona e il suo storico di frequenza: sono il registro tecnico della palestra. La cancellazione completa va richiesta secondo il punto 7.",
        ],
      },
      {
        heading: "6. Dove sono i dati e a chi li comunichiamo",
        paragraphs: [
          "I dati sono conservati su Supabase (database, autenticazione e archiviazione) e il sito è pubblicato su Vercel. Entrambi agiscono come responsabili del trattamento ai sensi dell'articolo 28 del GDPR.",
          "Il progetto è configurato su infrastruttura nell'Unione Europea. Qualora un fornitore tratti dati al di fuori dello Spazio Economico Europeo, il trasferimento avviene sulla base delle Clausole Contrattuali Standard adottate dalla Commissione europea.",
        ],
      },
      {
        heading: "7. I tuoi diritti",
        paragraphs: [
          "Puoi chiedere in ogni momento l'accesso ai tuoi dati, la loro rettifica o cancellazione, la limitazione del trattamento, la portabilità, e puoi opporti ai trattamenti fondati sul legittimo interesse (articoli da 15 a 22 del GDPR).",
          "Alcune correzioni sono immediate: dalla pagina Account puoi modificare da solo nome, email, telefono, data di nascita e note. Cintura, gradi e date di promozione sono invece in sola lettura di proposito, perché la promozione è una decisione dell'istruttore: per correggerle scrivi al titolare.",
          "Per esercitare i tuoi diritti scrivi a [EMAIL DI CONTATTO]. Se ritieni che il trattamento violi la normativa puoi proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).",
        ],
      },
      {
        heading: "8. Sicurezza",
        paragraphs: [
          "L'accesso avviene tramite account personale con password. Le password sono conservate solo come hash. La separazione fra ciò che ciascun ruolo può leggere e scrivere è applicata dal database attraverso politiche di Row Level Security, quindi vale anche per una richiesta che non passi dall'interfaccia.",
        ],
      },
    ],
    cookieHeading: "9. Cookie e archiviazione locale",
    cookieIntro:
      "Faixa BJJ usa esclusivamente cookie tecnici e archiviazione locale necessari al funzionamento del servizio o a ricordare una preferenza espressa dall'utente. Non usiamo cookie di profilazione, né strumenti di statistica o pubblicità, né cookie di terze parti. Per questi strumenti l'articolo 122 del Codice privacy non richiede il consenso preventivo: per questo il banner informa e non chiede un'autorizzazione.",
    cookieTable: {
      name: "Nome",
      type: "Tipo",
      purpose: "Finalità",
      duration: "Durata",
    },
    cookies: [
      {
        name: "sb-<progetto>-auth-token",
        type: "Cookie tecnico",
        purpose: "Mantiene la sessione di accesso. Senza, non è possibile restare autenticati.",
        duration: "Fino alla scadenza della sessione o alla disconnessione",
      },
      {
        name: "faixabjj-locale",
        type: "Cookie tecnico (preferenza)",
        purpose: "Ricorda la lingua scelta.",
        duration: "1 anno",
      },
      {
        name: "theme",
        type: "Archiviazione locale",
        purpose: "Ricorda la scelta fra tema chiaro e scuro.",
        duration: "Fino alla cancellazione dei dati del sito",
      },
      {
        name: "faixabjj-cookie-notice",
        type: "Archiviazione locale",
        purpose: "Ricorda che questa informativa è già stata mostrata.",
        duration: "Fino alla cancellazione dei dati del sito",
      },
    ],
    cookieRemoval:
      "Puoi cancellare cookie e archiviazione locale dalle impostazioni del browser. Cancellando il cookie di sessione verrai disconnesso; cancellando gli altri l'applicazione continua a funzionare e torna alle impostazioni predefinite.",
  },
};

// No `as const` above, deliberately: it would turn every value into a string
// *literal* type, and the English dictionary would then have to contain the
// Italian words to satisfy the type.
export type Dictionary = typeof it;
