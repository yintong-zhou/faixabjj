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
    gyms: "Academias",
    signIn: "Entrar",
    signOut: "Sair",
    menu: "Menu",
    theme: { toLight: "Mudar para o tema claro", toDark: "Mudar para o tema escuro" },
    language: "Idioma",
    privacy: "Privacidade e cookies",
  },

  belts: {
    white: "Branca",
    gray_white: "Cinza/Branca",
    gray: "Cinza",
    gray_black: "Cinza/Preta",
    yellow_white: "Amarela/Branca",
    yellow: "Amarela",
    yellow_black: "Amarela/Preta",
    orange_white: "Laranja/Branca",
    orange: "Laranja",
    orange_black: "Laranja/Preta",
    green_white: "Verde/Branca",
    green: "Verde",
    green_black: "Verde/Preta",
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
    captchaFailed:
      "Verificação de segurança falhou. Recarregue a página e tente novamente.",

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
    metaTitle: "Faixa BJJ - horas de aula, graus e faixas para academias de BJJ",
    metaDescription:
      "Software para academias de Jiu-Jitsu brasileiro: um único cadastro de alunos e instrutores, presenças com contagem automática de horas e critérios de graduação para graus e faixas. A decisão continua sendo do professor.",
    ogDescription:
      "Cadastro único, presenças com contagem automática de horas e critérios de graduação configuráveis, para academias de Jiu-Jitsu brasileiro.",
    badge: "MVP em desenvolvimento",
    title: "A evolução técnica, registrada.",
    lead: "O Faixa BJJ acompanha o sistema de gestão que a academia já usa e cobre aquilo que as ferramentas genéricas fazem mal: seguir o caminho de cada aluno rumo a graus e faixas, com o mínimo de trabalho extra para os professores.",
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
    platformAdmin:
      "Conta de administração do portal: não pertence a nenhuma academia e não tem faixa.",

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

  suspended: {
    title: "Academia suspensa",
    body: "O acesso a esta academia foi suspenso pela administração do portal. Os dados são mantidos e voltarão a ficar disponíveis se a academia for reativada. Para informações, fale com quem administra a sua academia.",
  },

  dashboard: {
    title: "Painel",
    staffLead:
      "A academia em um olhar: alunos, aulas do mês e distribuição das faixas.",
    memberLead: "Seu caminho: graduação, horas de aula e próximos treinos.",
    viewGym: "Academia",
    viewMine: "Meu caminho",
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
    beltNotForAdmin:
      "Não se aplica a uma conta apenas administrativa: um admin não tem graduação.",
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
    correctDates: "Corrigir as datas",
    correctDatesNote:
      "Serve para corrigir uma data errada, não para promover: não registra nenhuma promoção e não altera faixa nem graus. A elegibilidade é medida a partir dessas duas datas, então vale a pena que estejam certas.",
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
    userNotInGym: "Esta pessoa não faz parte da sua academia.",
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

    promotionRecorded: "Promoção registrada",
    promotionFailed: "Não foi possível registrar a promoção",
    promotionNotForward: "Uma promoção precisa avançar, não retroceder",
    datesSaved: "Datas da trajetória atualizadas",
    datesFailed: "Não foi possível atualizar as datas",
    dateInFuture: "Uma data não pode estar no futuro",
    stripeBeforeBelt: "O último grau não pode ser anterior à troca de faixa",
    criterionSaved: "Critério atualizado",
    criterionFailed: "Não foi possível salvar o critério",
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

  promotions: {
    queueTitle: "Mínimos atingidos",
    queueIntro:
      "Quem atingiu os mínimos de tempo e de horas para a próxima graduação. É uma sugestão: a avaliação continua sendo do professor.",
    queueEmpty: "Ninguém atingiu os mínimos no momento.",
    eligibleCount: (n: number) => (n === 1 ? "1 pessoa" : `${n} pessoas`),
    hoursNote: "Horas de aula, calculadas a 1 hora por aula",
    atCurrentRank: "Horas na graduação atual",
    criteriaTitle: "Critérios",
    criteriaPageTitle: "Critérios de Graduação",
    criteriaIntro:
      "Horas e tempo mínimos para cada graduação. Os valores das faixas vêm dos mínimos da IBJJF e da prática comum; os dos graus são uma estimativa inicial, para ajustar à academia.",
    minHours: "Horas mínimas",
    minDays: "Dias mínimos",
    minAge: "Idade mínima",
    criterionNotes: "Observações",
    save: "Salvar",
    promote: "Promover",
    promoteTitle: (name: string) => `Promover ${name}`,
    targetBelt: "Nova faixa",
    targetStripes: "Graus",
    promotedOn: "Data da promoção",
    promotionNotes: "Observações",
    confirm: "Registrar promoção",
    history: "Histórico de promoções",
    historyEmpty: "Nenhuma promoção registrada.",
    historyEntry: (from: string, to: string) => `De ${from} para ${to}`,
    promotedBy: (name: string) => `Registrada por ${name}`,
    remindersTitle: "Para avaliar no tatame",
    remindersNote: "Um lembrete, não uma checklist: nada disso é salvo.",
    reminders: {
      blue: [
        "Ataque e defesa básicos na guarda, montada, cem quilos e controle das costas",
        "Sobrevive no sparring sem ser finalizado com facilidade",
        "Segue as regras de segurança: bate a tempo, controla as finalizações",
        "Etiqueta básica no tatame",
        "Respeito pelos companheiros de treino",
      ],
      purple: [
        "Jogo pessoal reconhecível, com posições e sequências preferidas",
        "Passagens de guarda, finalizações e transições sólidas",
        "Se mantém contra faixas iguais e superiores",
        "Constância nos treinos",
        "Confiabilidade na academia",
      ],
      brown: [
        "Jogo técnico maduro",
        "Encadeia técnicas com fluidez",
        "Controle posicional avançado",
        "Sabe corrigir e ajudar as faixas menores",
        "Contribui ativamente com a academia",
        "Orienta ou auxilia no ensino",
      ],
      black: [
        "Adapta o jogo a estilos de oponente diferentes",
        "Capaz de ensinar o programa completo",
        "Maturidade marcial geral",
        "Liderança sustentada ao longo do tempo",
        "Humildade e respeito pela tradição",
        "Dedicação de longo prazo à arte e à academia",
      ],
    },
  },

  cookieNotice: {
    text: "Este site usa apenas cookies técnicos, necessários para manter a sessão aberta e lembrar o idioma escolhido. Nenhum cookie de perfilamento, nenhum serviço de estatísticas.",
    more: "Privacidade e cookies",
    accept: "Entendi",
  },

  privacy: {
    title: "Privacidade e cookies",
    updated: (date: string) => `Última atualização: ${date}`,
    lead:
      "Esta página explica quais dados pessoais o Faixa BJJ coleta, por quê, por quanto tempo os conserva e quais direitos você tem sobre eles.",
    draftTitle: "Documento provisório",
    draftBody:
      "O aplicativo está em fase de teste e o controlador dos dados ainda não foi designado. Antes de qualquer uso com dados de pessoas reais, é preciso preencher nome, endereço e contato do controlador e revisar os prazos de conservação indicados abaixo.",
    sections: [
      {
        heading: "1. Controlador dos dados",
        paragraphs: [
          "O controlador dos dados é [NOME DA ACADEMIA], com sede em [ENDEREÇO COMPLETO], contactável em [E-MAIL DE CONTATO].",
          "Não foi nomeado um Encarregado da proteção de dados (DPO): o tratamento não se enquadra nos casos em que o artigo 37 do GDPR o torna obrigatório. Se a academia nomear um, os contatos dele entram aqui.",
        ],
      },
      {
        heading: "2. Quais dados tratamos",
        paragraphs: [
          "Dados de contato e identificação: nome, e-mail, telefone, data de nascimento. Nome e e-mail são obrigatórios para criar uma conta; telefone e data de nascimento são opcionais.",
          "Dados de progressão técnica: faixa, número de graus, data da última troca de faixa, data do último grau, data de matrícula, função na academia e seu histórico.",
          "Dados de frequência: presença ou ausência em cada aula, registrando se a presença foi lançada pelo próprio aluno (check-in) ou pelo instrutor (chamada).",
          "Observações livres: um campo que a equipe pode preencher. Não deve ser usado para categorias especiais de dados nos termos do artigo 9 do GDPR — saúde ou lesões em particular — porque este aviso não cobre esse tipo de tratamento.",
          "Dados de acesso: credenciais geridas pelo provedor de autenticação (as senhas são guardadas apenas como hash, nunca em texto claro) e registros técnicos do serviço.",
        ],
      },
      {
        heading: "3. Por que tratamos e com que base legal",
        paragraphs: [
          "Gerir a matrícula e a relação com a academia, registrar presenças e contar as horas de treino: execução do contrato ou da relação associativa de que a pessoa é parte (art. 6.1.b do GDPR).",
          "Avaliar a elegibilidade a graus e faixas e manter o histórico da progressão técnica: legítimo interesse da academia em documentar o percurso técnico de seus alunos (art. 6.1.f do GDPR). A decisão sobre a graduação permanece sempre do instrutor: o aplicativo não promove ninguém automaticamente.",
          "Manter seguro o acesso ao portal: legítimo interesse em proteger contas e dados (art. 6.1.f do GDPR).",
          "Não realizamos perfilamento nem decisões automatizadas que produzam efeitos jurídicos sobre a pessoa.",
        ],
      },
      {
        heading: "4. Quem pode ver os dados",
        paragraphs: [
          "O acesso é limitado por função, e o limite é aplicado pelo próprio banco de dados, não apenas pela interface. Um aluno vê os próprios dados e o calendário das aulas. Um instrutor vê a lista de membros somente leitura e gere cursos e presenças. Mestre e administrador têm acesso completo e podem gerir as contas.",
          "Nenhum dado é vendido ou repassado a terceiros para fins de marketing.",
        ],
      },
      {
        heading: "5. Por quanto tempo conservamos",
        paragraphs: [
          "Os dados de matrícula e o histórico de frequência são conservados durante toda a relação com a academia e por [NÚMERO] anos depois, prazo a definir conforme as obrigações civis e fiscais aplicáveis.",
          "Revogar o acesso ao portal apaga as credenciais de acesso, mas mantém a ficha da pessoa e seu histórico de frequência: são o registro técnico da academia. A exclusão completa pode ser pedida conforme o ponto 7.",
        ],
      },
      {
        heading: "6. Onde estão os dados e com quem são compartilhados",
        paragraphs: [
          "Os dados são armazenados no Supabase (banco de dados, autenticação e armazenamento) e o site é publicado na Vercel. Ambos atuam como operadores nos termos do artigo 28 do GDPR.",
          "O projeto está configurado em infraestrutura na União Europeia. Caso um fornecedor trate dados fora do Espaço Econômico Europeu, a transferência apoia-se nas Cláusulas Contratuais-Tipo adotadas pela Comissão Europeia.",
        ],
      },
      {
        heading: "7. Seus direitos",
        paragraphs: [
          "Você pode a qualquer momento pedir acesso aos seus dados, sua retificação ou exclusão, a limitação do tratamento, a portabilidade, e pode opor-se aos tratamentos baseados no legítimo interesse (artigos 15 a 22 do GDPR).",
          "Algumas correções são imediatas: na página Conta você mesmo altera nome, e-mail, telefone, data de nascimento e observações. Faixa, graus e datas de graduação são somente leitura de propósito, porque a graduação é decisão do instrutor: para corrigi-las, escreva ao controlador.",
          "Para exercer seus direitos escreva para [E-MAIL DE CONTATO]. Se considerar que o tratamento infringe as regras, pode apresentar reclamação à autoridade de controle competente — na Itália, o Garante per la protezione dei dati personali (www.garanteprivacy.it).",
        ],
      },
      {
        heading: "8. Segurança",
        paragraphs: [
          "O acesso é feito por conta pessoal com senha. As senhas são guardadas apenas como hash. A separação entre o que cada função pode ler e escrever é aplicada pelo banco de dados através de políticas de Row Level Security, valendo portanto para qualquer requisição, inclusive uma que não passe pela interface.",
        ],
      },
    ],
    cookieHeading: "9. Cookies e armazenamento local",
    cookieIntro:
      "O Faixa BJJ usa exclusivamente cookies técnicos e armazenamento local necessários ao funcionamento do serviço ou para lembrar uma preferência expressa pelo usuário. Não usamos cookies de perfilamento, nem ferramentas de estatística ou publicidade, nem cookies de terceiros. Para essas ferramentas não é exigido consentimento prévio: por isso o banner informa em vez de pedir autorização.",
    cookieTable: {
      name: "Nome",
      type: "Tipo",
      purpose: "Finalidade",
      duration: "Duração",
    },
    cookies: [
      {
        name: "sb-<projeto>-auth-token",
        type: "Cookie técnico",
        purpose: "Mantém a sessão de acesso. Sem ele, não é possível permanecer autenticado.",
        duration: "Até o fim da sessão ou a saída da conta",
      },
      {
        name: "faixabjj-locale",
        type: "Cookie técnico (preferência)",
        purpose: "Lembra o idioma escolhido.",
        duration: "1 ano",
      },
      {
        name: "theme",
        type: "Armazenamento local",
        purpose: "Lembra a escolha entre tema claro e escuro.",
        duration: "Até a limpeza dos dados do site",
      },
      {
        name: "faixabjj-cookie-notice",
        type: "Armazenamento local",
        purpose: "Lembra que este aviso já foi exibido.",
        duration: "Até a limpeza dos dados do site",
      },
    ],
    cookieRemoval:
      "Você pode apagar cookies e armazenamento local nas configurações do navegador. Apagar o cookie de sessão desconecta você; apagar os demais mantém o aplicativo funcionando e de volta às configurações padrão.",
  },
};
