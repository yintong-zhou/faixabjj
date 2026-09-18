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
  },

  belts: {
    white: "Bianca",
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
    metaTitle: "FAIXABJJ - gestione ore, gradi e cinture per palestre di BJJ",
    metaDescription:
      "Software per scuole di Brazilian Jiu-Jitsu: registro unico di allievi e istruttori, presenze e conteggio ore automatico, criteri di promozione a gradi e cinture. La decisione resta all'istruttore.",
    ogDescription:
      "Registro unico, presenze con conteggio ore automatico e criteri di promozione configurabili, per scuole di Brazilian Jiu-Jitsu.",
    badge: "MVP in sviluppo",
    title: "La progressione tecnica tracciata.",
    lead: "FAIXABJJ affianca il gestionale che la palestra usa già e copre l'unica cosa che gli strumenti generici fanno male: seguire il percorso di ogni allievo verso gradi e cinture, aggiungendo il minimo indispensabile di lavoro agli istruttori.",
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
};

// No `as const` above, deliberately: it would turn every value into a string
// *literal* type, and the English dictionary would then have to contain the
// Italian words to satisfy the type.
export type Dictionary = typeof it;
