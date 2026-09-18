import type { Dictionary } from "./it";

// Brazilian Portuguese. Jiu-jitsu vocabulary follows Brazilian usage rather
// than a literal translation of the Italian: a stripe is a "grau", the head
// coach is the "professor", and attendance is "presença".
export const ptBR: Dictionary = {
  common: {
    save: "Salvar",
    saveChanges: "Salvar alterações",
    cancel: "Cancelar",
    back: "Voltar",
    none: "Nenhum",
    all: "Todos",
    today: "Hoje",
    dash: "—",
    open: "Abrir",
    close: "Fechar",
    details: "Detalhes",
    readOnly: "Somente leitura",
    notAvailable: "Indisponível",
    loading: "Carregando…",
  },

  nav: {
    home: "Início",
    dashboard: "Painel",
    presenze: "Presenças",
    corsi: "Aulas",
    registro: "Alunos",
    account: "Conta",
    signIn: "Entrar",
    signOut: "Sair",
    menu: "Menu",
    theme: { toLight: "Mudar para o tema claro", toDark: "Mudar para o tema escuro" },
    language: "Idioma",
  },

  belts: {
    white: "Branca",
    blue: "Azul",
    purple: "Roxa",
    brown: "Marrom",
    black: "Preta",
    label: (belt: string, stripes: number) =>
      stripes <= 0
        ? `Faixa ${belt.toLowerCase()}`
        : `Faixa ${belt.toLowerCase()}, ${stripes} grau${stripes === 1 ? "" : "s"}`,
  },

  roles: {
    student: "Aluno",
    assistant: "Auxiliar",
    instructor: "Instrutor",
    head_coach: "Professor",
    admin: "Admin",
  },

  dates: {
    days: (n: number) =>
      `${new Intl.NumberFormat("pt-BR").format(n)} dia${n === 1 ? "" : "s"}`,
    weekdayShort: ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"],
    weekdayLong: [
      "segunda-feira",
      "terça-feira",
      "quarta-feira",
      "quinta-feira",
      "sexta-feira",
      "sábado",
      "domingo",
    ],
  },

  auth: {
    signInTitle: "Entrar",
    signInLead: "Área reservada aos membros da academia.",
    email: "E-mail",
    password: "Senha",
    forgotLink: "Esqueceu a senha?",
    signInButton: "Entrar",
    wrongCredentials: "E-mail ou senha incorretos.",

    forgotTitle: "Esqueci a senha",
    forgotLead:
      "Informe seu e-mail: se a conta existir, enviamos um link para redefinir a senha.",
    forgotButton: "Enviar link",
    backToLogin: "Voltar para o login",
    sentTitle: "Verifique seu e-mail",
    sentLead:
      "Se o endereço estiver cadastrado, você receberá em breve um link para redefinir a senha.",

    changeTitleForced: "Escolha sua senha",
    changeTitle: "Alterar senha",
    changeLeadForced:
      "Sua conta foi criada com uma senha provisória, igual para todos. Escolha uma sua para continuar: até lá o restante do aplicativo fica fechado.",
    changeLead: "Defina uma nova senha para sua conta.",
    newPassword: "Nova senha",
    confirmPassword: "Confirmar senha",
    passwordHint: "Pelo menos 8 caracteres, e diferente da provisória.",
    changeButton: "Salvar e continuar",
    tooShort: "A senha deve ter pelo menos 8 caracteres.",
    mismatch: "As duas senhas não coincidem.",
    sameAsDefault: "Escolha uma senha diferente da padrão.",
    updateFailed: "Não foi possível atualizar a senha.",
    flagNotCleared:
      "Senha atualizada, mas a solicitação de alteração não foi encerrada. Tente novamente.",

    showPassword: "Mostrar a senha",
    hidePassword: "Ocultar a senha",
  },

  reset: {
    checkingTitle: "Redefinir senha",
    checkingLead: "Verificando o link…",
    invalidTitle: "Link inválido",
    invalidLead: "Este link para redefinir a senha não é válido ou expirou.",
    requestNewLink: "Solicitar um novo link",
    doneTitle: "Senha atualizada",
    doneLead: "Redirecionando você…",
    title: "Escolha uma nova senha",
    lead: "No mínimo 6 caracteres.",
    saveButton: "Salvar senha",
    updateFailed: "Não foi possível atualizar a senha. Solicite um novo link.",
  },

  home: {
    metaTitle: "FAIXABJJ - horas de aula, graus e faixas para academias de BJJ",
    metaDescription:
      "Software para academias de Jiu-Jitsu brasileiro: um único cadastro de alunos e instrutores, presenças com contagem automática de horas e critérios de graduação para graus e faixas. A decisão continua sendo do professor.",
    ogDescription:
      "Cadastro único, presenças com contagem automática de horas e critérios de graduação configuráveis, para academias de Jiu-Jitsu brasileiro.",
    badge: "MVP em desenvolvimento",
    title: "A evolução técnica, registrada.",
    lead: "O FAIXABJJ acompanha o sistema de gestão que a academia já usa e cobre aquilo que as ferramentas genéricas fazem mal: seguir o caminho de cada aluno rumo a graus e faixas, com o mínimo de trabalho extra para os professores.",
    ctaPrimary: "Entrar no portal",
    ctaSecondary: "Como funciona",
    noSignup:
      "O acesso é reservado aos membros da academia: as contas são criadas pela secretaria, não há cadastro aberto.",

    keywords: [
      "Jiu-Jitsu brasileiro",
      "BJJ",
      "gestão de academia de BJJ",
      "controle de presença BJJ",
      "contagem de horas de treino",
      "graus e faixas",
      "graduação de faixa BJJ",
    ],
    audience: "Escolas e academias de Jiu-Jitsu brasileiro",
    whatItDoes: "O que faz",
    features: [
      {
        title: "Cadastro único",
        description:
          "Um só perfil para alunos e instrutores: no BJJ a mesma pessoa costuma ser as duas coisas ao mesmo tempo, e o papel muda com o tempo sem perder o histórico.",
      },
      {
        title: "Presenças e horas",
        description:
          "Chamada do professor ou check-in do aluno, dentro de uma janela em torno da aula. Cada presença vale uma hora e o total se atualiza sozinho.",
      },
      {
        title: "Critérios de graduação",
        description:
          "Limites de horas e de tempo na graduação, configuráveis por faixa. O sistema aponta quem está pronto: graduar continua sendo decisão do professor.",
      },
    ],

    howItWorks: "Como funciona",
    steps: [
      {
        title: "Defina as aulas",
        description:
          "Dias, horário e período de cada aula recorrente. Daí nasce o calendário das aulas, sem precisar reinserir nada toda semana.",
      },
      {
        title: "Registre as presenças",
        description:
          "O professor faz a chamada em poucos toques pelo celular, ou o próprio aluno faz check-in ao chegar na academia.",
      },
      {
        title: "Veja quem está pronto",
        description:
          "Horas acumuladas e tempo na graduação atual, de cada pessoa, sempre ao lado do nome.",
      },
    ],

    notDoingTitle: "O que deliberadamente não faz",
    notDoingLead:
      "Não é um sistema de gestão completo e não pretende ser. Fica ao lado do que a academia já usa e cobre bem uma coisa só.",
    notDoing: [
      "Pagamentos, mensalidades e faturamento",
      "Matrícula online e gestão de contatos",
      "Gestão de competições e torneios",
      "Acompanhamento técnico por categoria posicional",
    ],

    alreadyMember: "Já é membro?",
    alreadyMemberLead:
      "Entre com o e-mail que você informou na academia. Se não lembrar a senha, pode redefini-la na página de acesso.",
  },

  account: {
    title: "Minha conta",
    lead: "Gerencie seus dados pessoais e as credenciais de acesso.",
    profileUnavailable:
      "Seu perfil não está disponível. Se o problema persistir, verifique se as migrações do banco de dados foram aplicadas.",

    personalData: "Dados pessoais",
    fullName: "Nome completo",
    phone: "Telefone",
    birthDate: "Data de nascimento",
    notes: "Observações",
    emailChangeNote:
      "Ao mudar o endereço você receberá um e-mail de confirmação: o novo endereço só passa a valer depois que você abri-lo.",

    rankAndRoles: "Graduação e funções",
    rankReadOnly:
      "Faixa, graus e funções não podem ser alterados aqui: a graduação continua sendo decisão do professor.",
    openingBalanceNote: (perWeek: number) =>
      `As horas incluem um saldo inicial, estimado em ${perWeek} aulas por semana para o período anterior ao registro. A partir daí só aumentam com o seu check-in ou com a chamada do professor.`,
    belt: "Faixa",
    beltSince: "Faixa desde",
    stripeSince: "Último grau",
    joinedOn: "Matriculado desde",
    classHours: "Horas de aula",
    activeRoles: "Funções ativas",
    manageMembers: "Gerenciar os membros no cadastro →",

    passwordSection: "Senha",
    updatePassword: "Atualizar senha",
    passwordMinimum: "Pelo menos 8 caracteres.",
    estimateSuffix: "(estimativa)",
  },

  dashboard: {
    title: "Painel",
    staffLead:
      "A academia em um olhar: alunos, aulas do mês e distribuição das faixas.",
    memberLead: "Seu caminho: graduação, horas de aula e próximos treinos.",
    profileUnavailable:
      "Seu perfil não está disponível. Se o problema persistir, avise a secretaria da academia.",

    students: "Alunos",
    activeMembers: "Membros ativos",
    ofTotal: (n: number) => `${n} no total`,
    newMembers: (days: number) => `Novos (${days} dias)`,
    recentlyJoined: "matriculados recentemente",
    withoutAccount: "Sem conta",
    neverInvited: "nunca convidados ou revogados",
    gymHours: "Horas da academia",
    openingBalancesIncluded: "saldos iniciais incluídos",

    monthLessons: "Aulas do mês",
    scheduled: "No calendário",
    activeCourses: (n: number) => `${n} aulas ativas`,
    held: "Já realizadas",
    cancelledCount: (n: number) => `${n} canceladas`,
    attendances: "Presenças",
    recordedThisMonth: "registradas neste mês",
    averagePerLesson: "Média por aula",
    studentsPresent: "alunos presentes",
    todayHeading: "Hoje",
    noLessonsToday: "Nenhuma aula programada para hoje.",
    noInstructor: "sem instrutor",
    presentCount: (n: number) => `${n} presentes`,
    rollCall: "Chamada",

    belts: "Faixas",
    beltSpread: (n: number) => `Distribuição entre os ${n} membros ativos.`,
    unknownBelts: (n: number) =>
      `${n} membros têm uma faixa não reconhecida e não aparecem no gráfico.`,

    yourRank: "Sua graduação",
    atThisBelt: "Nesta faixa",
    sinceLastStripe: "Desde o último grau",
    promotionNote:
      "Faixa e graus são atribuídos pelo seu professor: aqui você vê apenas a situação atual, a graduação nunca é automática.",

    yourTraining: "Seu treino",
    totalHours: "Horas totais",
    openingBalanceIncluded: "saldo inicial incluído",
    recordedHours: "horas registradas",
    lastDays: (days: number) => `Últimos ${days} dias`,
    lessonsDone: "aulas feitas",
    average: "Média",
    lessonsPerWeek: "aulas por semana",
    lastTime: "Última vez",
    noneInWindow: (days: number) => `nenhuma nos últimos ${days} dias`,
    memberEstimateNote: (perWeek: number) =>
      `O total inclui um saldo inicial, estimado em ${perWeek} aulas por semana para o período anterior ao registro. A partir daí só aumenta com o seu check-in ou com a chamada do professor.`,

    nextLessons: "Próximas aulas",
    noUpcoming: "Nenhuma aula no calendário nos próximos dias.",
    checkinHint:
      "O check-in é feito em Presenças, quando você está na academia e a janela está aberta.",
  },

  presenze: {
    title: "Presenças",
    staffLead: "As aulas no calendário. Abra uma aula para fazer a chamada.",
    memberLead:
      "As aulas no calendário. Faça o check-in quando estiver na academia: cada presença vale uma hora.",
    loadFailed:
      "Não foi possível carregar o calendário. Verifique se as migrações do banco de dados foram aplicadas.",
    profileMissing: "Seu perfil não está disponível, então o check-in está desativado.",

    viewList: "Lista",
    viewGrid: "Grade",
    weekOf: (date: string) => `Semana de ${date}`,
    previousWeek: "Anterior",
    nextWeek: "Próxima",
    previousMonth: "Mês anterior",
    nextMonth: "Próximo mês",
    todaySuffix: " · hoje",

    noLessonsThisWeek: "Nenhuma aula nesta semana.",
    noLessonsThisDay: "Nenhuma aula neste dia.",
    cellRollCall: (course: string) => `Chamada: ${course}`,
    cellOpenDay: (n: number) => `${n} aulas — abrir o dia`,

    noInstructor: "sem instrutor",
    cancelledSuffix: " · aula cancelada",
    presentCount: (n: number) => `${n} presentes`,
    rollCall: "Chamada",

    absent: "ausente",
    present: "Presente",
    undo: "Desfazer",
    cancelledState: "cancelada",
    tooEarly: "check-in ainda não aberto",
    closed: "check-in encerrado",
    openState: "check-in aberto",
    checkIn: "Check-in",
  },

  rollCall: {
    notRecorded: "Não registrado",
    present: "Presente",
    absent: "Ausente",
    presentTotal: (n: number) => `${n} presente${n === 1 ? "" : "s"}`,
    cancelledNotice:
      "Aula cancelada: o check-in está encerrado. As presenças já registradas permanecem.",
    lessonSection: "Aula",
    instructor: "Instrutor",
    restoreLesson: "Restaurar aula",
    cancelLesson: "Cancelar aula",
    cancelConfirm:
      "Cancelar esta aula? O check-in encerra, mas as presenças já registradas permanecem.",
    courseSuspendedNotice:
      "Curso suspenso: o check-in está encerrado e as próximas aulas saem do calendário. As presenças já registradas permanecem.",
    selfCheckinTag: "check-in",
    selfCheckins: (n: number) =>
      `${n} ${n === 1 ? "pessoa fez" : "pessoas fizeram"} check-in sozinha${n === 1 ? "" : "s"}: confira antes de salvar.`,
    instructorTag: "instrutor",
    noMembers: "Nenhum membro no cadastro.",
    saveRollCall: "Salvar chamada",
  },

  registro: {
    title: "Alunos",
    leadEditor:
      "Todos os membros da academia. Aqui você adiciona uma pessoa e gerencia o acesso dela.",
    leadReadOnly:
      "Todos os membros da academia. Com sua função de instrutor esta seção é somente leitura.",
    loadFailed:
      "Não foi possível carregar o cadastro. Verifique se as migrações do banco de dados foram aplicadas.",

    addPerson: "Adicionar pessoa",
    addToRegistry: "Adicionar ao cadastro",
    defaultPasswordNoteBefore:
      "A conta também é criada, ativa na hora e sem e-mail de confirmação. Senha provisória:",
    defaultPasswordNoteAfter:
      "— informe-a à pessoa. No primeiro acesso será pedido que ela a substitua antes de poder usar o restante do aplicativo.",
    select: "Selecione…",
    stripes: "Graus",
    todayIfEmpty: "(hoje, se vazio)",
    role: "Função",

    filters: "Filtros",
    name: "Nome",
    searchByName: "Buscar por nome",
    onlyActive: "Somente membros ativos",
    onlyActiveChip: "somente ativos",
    filter: "Filtrar",
    reset: "Limpar",

    noneFound: "Nenhum membro encontrado.",
    countAndPage: (total: number, page: number, pages: number) =>
      `${total} membro${total === 1 ? "" : "s"} · página ${page} de ${pages}`,
    noMatch: "Nenhum membro corresponde aos filtros escolhidos.",
    previous: "Anterior",
    next: "Próxima",

    noAccount: "sem conta",
    trainingFor: (days: string) => `${days} de BJJ`,
    atCurrentBelt: (days: string) => `${days} na faixa atual`,
    noActiveRole: "Nenhuma função ativa",
    memberSince: " · desde ",
    estimateSuffix: " (estimativa)",

    rowActions: (name: string) => `Ações para ${name}`,
    details: "Detalhes",
    invite: "Convidar para o portal",
    resetPassword: "Redefinir senha",
    resetPasswordConfirm: (name: string) =>
      `Redefinir a senha de ${name} para a provisória? A senha atual deixará de funcionar.`,
    revoke: "Revogar acesso",
    revokeConfirm: (name: string) =>
      `Revogar o acesso de ${name}? A ficha permanece no cadastro, mas a pessoa não poderá mais entrar no portal.`,

    backToRegistry: "Alunos",
    detailReadOnly:
      "Somente leitura: com sua função de instrutor esta ficha não pode ser editada.",
    personalSection: "Dados pessoais",
    pathSection: "Trajetória",
    notesSection: "Observações",
    rolesSection: "Funções",
    noRoles: "Nenhuma função atribuída.",
    roleRange: (from: string, to: string) => `de ${from} a ${to}`,
    roleOpen: (from: string) => `desde ${from} · ativa`,
    totalHours: "Horas totais",
    recordedHours: "Horas registradas",
    openingHours: "Horas iniciais (estimativa)",
    trainingTime: "Treina há",
    beltTime: "Nesta faixa há",
    stripeTime: "Desde o último grau",
    openingBalanceExplained: (date: string, perWeek: number) =>
      `As horas iniciais cobrem apenas o período da matrícula até ${date}, calculadas em ${perWeek} aulas por semana porque não existe histórico de presenças para aqueles anos. São um saldo de partida e não aumentam mais: a partir de ${date} cada hora vem apenas do check-in do aluno ou da chamada do professor.`,
  },

  msg: {
    genericFailed: "A operação não foi concluída.",
    alreadyPresent: "Você já consta como presente nesta aula.",
    undoTooLate: "Não é mais possível desfazer este check-in.",
    checkinFailed:
      "Não foi possível registrar o check-in. Tente de novo; se continuar, avise o instrutor.",
    undoFailed:
      "Não foi possível desfazer o check-in. Tente de novo; se continuar, avise o instrutor.",
    restoreFailed: "A restauração não foi concluída.",
    pickBelt: "Selecione uma faixa.",
    pickRole: "Selecione uma função.",
    emailNeededToInvite:
      "É necessário um endereço de e-mail na ficha para convidar esta pessoa.",
    resetFailed: "A redefinição não foi concluída.",
    cannotRevokeSelf: "Você não pode revogar o seu próprio acesso.",
    revokeFailed: "A revogação não foi concluída.",
    nameEmpty: "O nome não pode ficar vazio.",
    profileNotFound: "Perfil não encontrado.",
    profileSaveFailed: "Não foi possível salvar o perfil.",
    profileSaved: "Perfil atualizado.",
    profileSavedEmailPending:
      "Perfil salvo. Confirme o novo endereço pelo link que enviamos por e-mail.",
    profileSavedEmailFailed: "Perfil salvo, mas a troca de e-mail não foi concluída.",
    passwordUpdated: "Senha atualizada.",
    profileUnavailable: "Seu perfil não está disponível.",

    nameRequired: "O nome é obrigatório.",
    emailRequired: "O e-mail é obrigatório.",
    joinDateRequired: "A data de matrícula é obrigatória.",
    stripesRange: "Os graus devem ser um número de 0 a 4.",
    userNotSpecified: "Usuário não especificado.",
    adminClientMissing: "Cliente de administração indisponível.",
    secretMissingCreate:
      "SUPABASE_SECRET_KEY não está configurada: não é possível criar contas.",
    secretMissingInvite: "SUPABASE_SECRET_KEY não está configurada: os convites estão desativados.",
    secretMissingReset: "SUPABASE_SECRET_KEY não está configurada: a redefinição está desativada.",
    secretMissingRevoke: "SUPABASE_SECRET_KEY não está configurada: a revogação está desativada.",
    accountNotCreated:
      "Conta não criada: o endereço de e-mail pode já estar cadastrado.",
    personAdded: (name: string, password: string) =>
      `${name} adicionada ao cadastro. Conta ativa: senha provisória ${password}, a ser trocada no primeiro acesso.`,
    personAddedNoRole: (name: string) =>
      `${name} foi adicionada, mas a função não foi atribuída.`,
    accountCreatedNoProfile: (email: string) =>
      `Conta criada para ${email}, mas os dados da ficha não foram salvos.`,
    inviteFailed: "O convite falhou. O endereço pode já estar cadastrado.",
    inviteSent: (email: string) => `Convite enviado para ${email}.`,
    passwordReset: (who: string, password: string) =>
      `A senha de ${who} voltou a ser a provisória (${password}): será pedido que ela a troque no primeiro acesso.`,
    someUser: "o usuário",
    accessRevoked: "Acesso revogado. A ficha permanece no cadastro.",

    courseNameRequired: "O nome da aula é obrigatório.",
    timesRequired: "Horário de início e de fim são obrigatórios.",
    endBeforeStart: "O horário de fim deve ser depois do de início.",
    pickOneDay: "Escolha ao menos um dia da semana.",
    opensRange: "Os minutos de abertura do check-in devem ficar entre 0 e 1440.",
    closesRange: "Os minutos de encerramento do check-in devem ficar entre 0 e 1440.",
    endDateBeforeStart: "A data de fim deve ser depois da de início.",
    courseNotCreated: "Aula não criada.",
    courseNotSpecified: "Aula não especificada.",
    courseNotFound: "Aula não encontrada.",
    courseUpdateFailed: "A alteração não foi concluída.",
    courseCreated: (name: string, lessons: number) =>
      `${name} criada, ${lessons} aulas no calendário.`,
    courseCreatedNoCalendar: (name: string) =>
      `${name} criada, mas o calendário não foi gerado.`,
    courseUpdated: (name: string) => `${name} atualizada e calendário regerado.`,
    courseUpdatedNoCalendar: "Aula atualizada, mas o calendário não foi regerado.",
    calendarExtended: (name: string, lessons: number) =>
      `Calendário de ${name} estendido para ${lessons} aulas.`,
    calendarNotExtended: "O calendário não foi estendido.",
    courseSuspended: "Aula suspensa.",
    courseReactivated: "Aula reativada.",
    courseDeleted: "Aula excluída.",
    courseHasAttendance: "A aula tem presenças registradas: você só pode suspendê-la.",
    deleteFailed: "A exclusão não foi concluída.",

    sessionNotSpecified: "Aula não especificada.",
    checkinClosed: "O check-in para esta aula não está aberto.",
    checkinRecorded: "Check-in registrado.",
    checkinUndone: "Check-in desfeito.",
    rollCallSaved: (present: number) => `Chamada salva: ${present} presentes.`,
    rollCallSavedKept: (present: number, kept: number) =>
      `Chamada salva: ${present} presentes. ${kept} check-in${kept === 1 ? "" : "s"} que ${kept === 1 ? "chegou" : "chegaram"} depois da abertura da chamada ${kept === 1 ? "foi mantido" : "foram mantidos"}.`,
    rollCallPartial: "A chamada foi salva apenas em parte.",
    rollCallFailed: "A chamada não foi salva.",
    instructorUpdated: "Instrutor atualizado.",
    instructorNotUpdated: "O instrutor não foi atualizado.",
    lessonCancelled: "Aula cancelada.",
    lessonRestored: "Aula restaurada.",
    cancelFailed: "O cancelamento não foi concluído.",
  },

  corsi: {
    noDays: "nenhum dia",
    title: "Aulas",
    lead:
      "As aulas recorrentes da academia. Daqui nasce o calendário de aulas que você vê em Presenças.",
    loadFailed:
      "Não foi possível carregar as aulas. Verifique se as migrações do banco de dados foram aplicadas.",

    addCourse: "Adicionar aula",
    createCourse: "Criar aula",
    addHint:
      "Ao salvar a aula são geradas as aulas das próximas oito semanas. As aulas já realizadas nunca são alteradas. O instrutor indicado aqui é o padrão: as aulas geradas o herdam e ele continua editável em cada aula, pela página da chamada em Presenças.",

    courseName: "Nome da aula",
    days: "Dias",
    startTime: "Início",
    endTime: "Fim",
    hourAria: (label: string) => `${label}: horas`,
    minuteAria: (label: string) => `${label}: minutos`,
    activeFrom: "Ativa a partir de",
    todayIfEmpty: "(hoje, se vazio)",
    activeUntil: "Até",
    neverEndsIfEmpty: "(sem fim, se vazio)",
    checkinBefore: "Check-in a partir de (min antes)",
    checkinAfter: "Check-in até (min depois)",
    instructor: "Instrutor",
    instructorDefault: "(padrão da aula)",
    currentInstructor: "Instrutor atual",
    description: "Descrição",

    suspended: "suspensa",
    noInstructor: "sem instrutor",
    noUpcoming: "nenhuma aula futura no calendário",
    upcomingCount: (n: number) => `${n} aulas no calendário`,
    checkinWindow: (before: number, after: number) =>
      ` · check-in de ${before} min antes a ${after} min depois`,

    rowActions: (name: string) => `Ações para ${name}`,
    extendCalendar: "Estender calendário",
    suspend: "Suspender",
    reactivate: "Reativar",
    remove: "Excluir",
    edit: "Editar",
    deleteConfirm: (name: string) =>
      `Excluir ${name}? Só é possível se não houver presenças registradas; caso contrário, você pode suspendê-la.`,
    empty:
      "Nenhuma aula ainda. Crie uma acima: as aulas aparecem em Presenças logo em seguida.",

  },

  hours: {
    hours: (n: string) => `${n} horas`,
    estimateNote: (estimated: string, perWeek: number) =>
      `Inclui ${estimated} horas iniciais, estimadas em ${perWeek} aulas por semana desde a matrícula, referentes ao período anterior ao registro de presenças. A partir daí as horas só aumentam com o check-in ou a chamada.`,
  },
};
