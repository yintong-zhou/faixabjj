import type { Dictionary } from "./it";

// Typed as Dictionary, so a key that Italian has and this file lacks is a
// compile error rather than a blank string in the interface.
export const en: Dictionary = {
  common: {
    save: "Save",
    saveChanges: "Save changes",
    cancel: "Cancel",
    back: "Back",
    none: "None",
    all: "All",
    today: "Today",
    dash: "—",
    open: "Open",
    close: "Close",
    details: "Details",
    readOnly: "Read only",
    notAvailable: "Not available",
    loading: "Loading…",
  },

  nav: {
    home: "Home",
    dashboard: "Dashboard",
    presenze: "Attendance",
    corsi: "Classes",
    registro: "Members",
    account: "Account",
    gyms: "Gyms",
    signIn: "Sign in",
    signOut: "Sign out",
    menu: "Menu",
    theme: { toLight: "Switch to light theme", toDark: "Switch to dark theme" },
    language: "Language",
    privacy: "Privacy and cookies",
  },

  belts: {
    white: "White",
    gray_white: "Grey/White",
    gray: "Grey",
    gray_black: "Grey/Black",
    yellow_white: "Yellow/White",
    yellow: "Yellow",
    yellow_black: "Yellow/Black",
    orange_white: "Orange/White",
    orange: "Orange",
    orange_black: "Orange/Black",
    green_white: "Green/White",
    green: "Green",
    green_black: "Green/Black",
    blue: "Blue",
    purple: "Purple",
    brown: "Brown",
    black: "Black",
    label: (belt: string, stripes: number) =>
      stripes <= 0
        ? `${belt} belt`
        : `${belt} belt, ${stripes} stripe${stripes === 1 ? "" : "s"}`,
  },

  roles: {
    student: "Student",
    assistant: "Assistant",
    instructor: "Instructor",
    head_coach: "Head coach",
    admin: "Admin",
  },

  dates: {
    days: (n: number) =>
      `${new Intl.NumberFormat("en-GB").format(n)} day${n === 1 ? "" : "s"}`,
    weekdayShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    weekdayLong: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ],
  },

  auth: {
    signInTitle: "Sign in",
    signInLead: "Reserved for members of the gym.",
    email: "Email",
    password: "Password",
    forgotLink: "Forgotten your password?",
    signInButton: "Sign in",
    wrongCredentials: "Email or password is incorrect.",
    captchaFailed: "Security check failed. Reload the page and try again.",

    forgotTitle: "Forgotten password",
    forgotLead:
      "Enter your email: if the account exists, we will send you a link to reset your password.",
    forgotButton: "Send link",
    backToLogin: "Back to sign in",
    sentTitle: "Check your email",
    sentLead:
      "If the address is registered, a link to reset your password is on its way.",

    changeTitleForced: "Choose your password",
    changeTitle: "Change password",
    changeLeadForced:
      "Your account was created with a temporary password, the same one for everybody. Choose your own to carry on: until then the rest of the app stays closed.",
    changeLead: "Set a new password for your account.",
    newPassword: "New password",
    confirmPassword: "Confirm password",
    passwordHint: "At least 8 characters, and different from the temporary one.",
    changeButton: "Save and continue",
    tooShort: "The password must be at least 8 characters long.",
    mismatch: "The two passwords do not match.",
    sameAsTemporary: "Choose a password different from the temporary one.",
    updateFailed: "The password could not be updated.",
    flagNotCleared:
      "Password updated, but the change request was not cleared. Please try again.",

    showPassword: "Show the password",
    hidePassword: "Hide the password",
  },

  reset: {
    checkingTitle: "Reset password",
    checkingLead: "Checking the link…",
    invalidTitle: "Invalid link",
    invalidLead: "This password reset link is not valid, or it has expired.",
    requestNewLink: "Request a new link",
    doneTitle: "Password updated",
    doneLead: "Redirecting you…",
    title: "Choose a new password",
    lead: "At least 6 characters.",
    saveButton: "Save password",
    updateFailed: "The password could not be updated. Request a new link.",
  },

  home: {
    metaTitle: "Faixa BJJ - class hours, stripes and belts for BJJ gyms",
    metaDescription:
      "Software for Brazilian Jiu-Jitsu schools: one registry for students and instructors, attendance with an automatic hour count, and promotion criteria for stripes and belts. The decision stays with the instructor.",
    ogDescription:
      "One registry, attendance with an automatic hour count and configurable promotion criteria, for Brazilian Jiu-Jitsu schools.",
    badge: "MVP in development",
    title: "Technical progress, tracked.",
    lead: "Faixa BJJ sits alongside the management software your gym already uses and covers the one thing generic tools do badly: following each student's path towards stripes and belts, while adding as little work as possible for instructors.",
    ctaPrimary: "Sign in to the portal",
    ctaSecondary: "How it works",
    noSignup:
      "Access is reserved for members of the gym: accounts are created by the office, there is no open sign-up.",

    keywords: [
      "Brazilian Jiu-Jitsu",
      "BJJ",
      "BJJ gym management",
      "BJJ attendance tracker",
      "training hours count",
      "stripes and belts",
      "BJJ belt promotion",
    ],
    audience: "Brazilian Jiu-Jitsu schools and gyms",
    whatItDoes: "What it does",
    features: [
      {
        title: "One registry",
        description:
          "A single profile for students and instructors: in BJJ the same person is often both at once, and the role changes over time without losing the history.",
      },
      {
        title: "Attendance and hours",
        description:
          "The instructor's roll call, or the student's own check-in within a window around the class. One attendance is one hour, and the total keeps itself up to date.",
      },
      {
        title: "Promotion criteria",
        description:
          "Hour and time-at-rank thresholds, configurable per belt. The system flags who is ready: promoting stays the instructor's decision.",
      },
    ],

    howItWorks: "How it works",
    steps: [
      {
        title: "Define the classes",
        description:
          "Days, times and period for each recurring class. The lesson calendar follows from that, with nothing to re-enter each week.",
      },
      {
        title: "Record attendance",
        description:
          "The instructor takes the roll call in a few taps on a phone, or the student checks themselves in on arriving at the gym.",
      },
      {
        title: "See who is ready",
        description:
          "Hours accumulated and time spent at the current rank, for every person, always next to their name.",
      },
    ],

    notDoingTitle: "What it deliberately does not do",
    notDoingLead:
      "It is not a full management system and does not want to become one. It sits beside what the gym already uses, and covers one thing well.",
    notDoing: [
      "Payments, memberships and invoicing",
      "Online sign-up and lead management",
      "Competition and tournament management",
      "Technical tracking by positional category",
    ],

    alreadyMember: "Already a member?",
    alreadyMemberLead:
      "Sign in with the email you gave the gym. If you do not remember your password you can reset it from the sign-in page.",
  },

  account: {
    title: "My account",
    lead: "Manage your personal details and sign-in credentials.",
    profileUnavailable:
      "Your profile is not available. If the problem persists, check that the database migrations have been applied.",
    platformAdmin:
      "Portal administration account: it belongs to no gym and holds no belt.",

    personalData: "Personal details",
    fullName: "Full name",
    phone: "Phone",
    birthDate: "Date of birth",
    notes: "Notes",
    emailChangeNote:
      "Changing your address sends a confirmation email: the new address only takes effect once you have opened it.",

    rankAndRoles: "Rank and roles",
    rankReadOnly:
      "Belt, stripes and roles cannot be changed here: promotion stays the instructor's decision.",
    openingBalanceNote: (perWeek: number) =>
      `The total includes an opening balance, estimated at ${perWeek} classes a week for the period before tracking began. From then on it only grows through your check-in or the instructor's roll call.`,
    belt: "Belt",
    beltSince: "Belt awarded on",
    stripeSince: "Last stripe",
    joinedOn: "Member since",
    classHours: "Class hours",
    activeRoles: "Active roles",
    manageMembers: "Manage members in the registry →",
    myGym: "Gym location and check-in QR →",

    passwordSection: "Password",
    updatePassword: "Update password",
    passwordMinimum: "At least 8 characters.",
    estimateSuffix: "(estimate)",
  },

  suspended: {
    title: "Gym suspended",
    body: "Access to this gym has been suspended by the portal's administration. Its data is kept and will be available again if the gym is reactivated. For information, ask whoever runs your gym.",
    noGymTitle: "Account without a gym",
    noGymBody: "This account does not belong to any gym, so there is nothing to show. For information, ask whoever runs your gym.",
  },

  dashboard: {
    title: "Dashboard",
    staffLead:
      "The gym at a glance: students, this month's lessons and the belt spread.",
    memberLead: "Your path: rank, class hours and upcoming training.",
    viewGym: "Gym",
    viewMine: "My path",
    profileUnavailable:
      "Your profile is not available. If the problem persists, let the gym office know.",

    students: "Students",
    activeMembers: "Active members",
    ofTotal: (n: number) => `${n} in total`,
    newMembers: (days: number) => `New (${days} days)`,
    recentlyJoined: "joined recently",
    withoutAccount: "Without an account",
    neverInvited: "never invited, or revoked",
    gymHours: "Gym hours",
    openingBalancesIncluded: "opening balances included",

    monthLessons: "This month's lessons",
    scheduled: "Scheduled",
    activeCourses: (n: number) => `${n} active classes`,
    held: "Already held",
    cancelledCount: (n: number) => `${n} cancelled`,
    attendances: "Attendances",
    recordedThisMonth: "recorded this month",
    averagePerLesson: "Average per lesson",
    studentsPresent: "students present",
    todayHeading: "Today",
    noLessonsToday: "No lessons scheduled today.",
    noInstructor: "no instructor",
    presentCount: (n: number) => `${n} present`,
    rollCall: "Roll call",

    belts: "Belts",
    beltSpread: (n: number) => `Spread across the ${n} active members.`,
    unknownBelts: (n: number) =>
      `${n} members have an unrecognised belt and do not appear in the chart.`,

    yourRank: "Your rank",
    atThisBelt: "At this belt",
    sinceLastStripe: "Since the last stripe",
    promotionNote:
      "Your instructor awards belts and stripes: this only shows where you stand, promotion is never automatic.",

    yourTraining: "Your training",
    totalHours: "Total hours",
    openingBalanceIncluded: "opening balance included",
    recordedHours: "recorded hours",
    lastDays: (days: number) => `Last ${days} days`,
    lessonsDone: "classes attended",
    average: "Average",
    lessonsPerWeek: "classes a week",
    lastTime: "Last time",
    noneInWindow: (days: number) => `none in the last ${days} days`,
    memberEstimateNote: (perWeek: number) =>
      `The total includes an opening balance, estimated at ${perWeek} classes a week for the period before tracking began. From then on it only grows through your check-in or the instructor's roll call.`,

    nextLessons: "Next lessons",
    noUpcoming: "No lessons scheduled in the coming days.",
    checkinHint:
      "Check-in happens in Attendance, when you are at the gym and the window is open.",
  },

  presenze: {
    title: "Attendance",
    staffLead: "The lessons in the calendar. Open one to take the roll call.",
    memberLead:
      "The lessons in the calendar. Check in when you are at the gym: one attendance is one hour.",
    loadFailed:
      "The calendar could not be loaded. Check that the database migrations have been applied.",
    profileMissing: "Your profile is not available, so check-in is disabled.",

    viewList: "List",
    viewGrid: "Grid",
    weekOf: (date: string) => `Week of ${date}`,
    previousWeek: "Previous",
    nextWeek: "Next",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    todaySuffix: " · today",

    noLessonsThisWeek: "No lessons this week.",
    noLessonsThisDay: "No lessons on this day.",
    cellRollCall: (course: string) => `Roll call: ${course}`,
    cellOpenDay: (n: number) => `${n} lessons — open the day`,

    noInstructor: "no instructor",
    cancelledSuffix: " · lesson cancelled",
    presentCount: (n: number) => `${n} present`,
    rollCall: "Roll call",

    absent: "absent",
    present: "Present",
    undo: "Undo",
    cancelledState: "cancelled",
    tooEarly: "check-in not open yet",
    closed: "check-in closed",
    openState: "check-in open",
    checkIn: "Check in",
  },

  checkin: {
    title: "Check-in",
    lead: "Mark yourself present at the current lesson. Check-in works only at the gym.",
    noOpenSession: "No lesson is open for check-in right now.",
    toCalendar: "Go to the calendar",
    staffUseRollCall: "Staff record attendance with the roll call, from the calendar.",
    locating: "Finding your location…",
    sending: "Sending…",
    retry: "Try again",
    locationNeeded: "At this gym check-in needs your phone's location. Try again and allow location access.",
    imprecise: "Your location is too imprecise. Move near the entrance or a window and try again.",
    tooFar: (m: number) =>
      `You appear to be about ${m} m from the gym: check-in works only at the gym, within 50 m.`,
    geo: {
      denied:
        "The browser is not allowed to read your location. Turn it back on in the site settings, or ask the instructor to mark you in the roll call.",
      unavailable: "Location unavailable. Check that location services are on and try again.",
      timeout: "Your location did not arrive in time. Try again.",
      unsupported: "This browser does not provide a location. Ask the instructor to mark you in the roll call.",
    },
  },

  myGym: {
    title: "My gym",
    lead: "The gym's location and the check-in QR code.",
    locationSection: "Location",
    locationHelp:
      "With a location set, members can check in only within 50 m of this point. Most precise: at the gym, press “Use my current location”.",
    noLocation: "No location set: check-in works from anywhere, during the lesson's window.",
    useCurrent: "Use my current location",
    locating: "Finding your location…",
    save: "Save location",
    clear: "Remove location",
    qrSection: "Check-in QR code",
    qrHelp:
      "Print it and put it up at the gym. Scanning it opens the check-in page, with the same location check as the button.",
    qrCaption: "Scan to check in",
    print: "Print",
    saved: "Location saved.",
    cleared: "Location removed.",
    failed: "Something went wrong. Try again.",
  },

  rollCall: {
    notRecorded: "Not recorded",
    present: "Present",
    absent: "Absent",
    presentTotal: (n: number) => `${n} present`,
    cancelledNotice:
      "Lesson cancelled: check-in is closed. Attendance already recorded is kept.",
    lessonSection: "Lesson",
    instructor: "Instructor",
    restoreLesson: "Restore lesson",
    cancelLesson: "Cancel lesson",
    cancelConfirm:
      "Cancel this lesson? Check-in closes, but attendance already recorded is kept.",
    courseSuspendedNotice:
      "Course suspended: check-in is closed and its upcoming lessons are off the calendar. Attendance already recorded is kept.",
    selfCheckinTag: "check-in",
    selfCheckins: (n: number) =>
      `${n} ${n === 1 ? "person" : "people"} checked themselves in: review before saving.`,
    instructorTag: "instructor",
    noMembers: "No members in the registry.",
    saveRollCall: "Save roll call",
  },

  registro: {
    title: "Members",
    leadEditor:
      "Everyone in the gym. Add a person here and manage their access.",
    leadReadOnly:
      "Everyone in the gym. With your instructor role this section is read only.",
    loadFailed:
      "The registry could not be loaded. Check that the database migrations have been applied.",

    addPerson: "Add a person",
    addToRegistry: "Add to the registry",
    temporaryPasswordNote:
      "An account is created too, active immediately and with no confirmation email. Once saved, a temporary password for this account alone is shown: pass it on to the person. They will be asked to replace it on first sign-in, before anything else in the app opens.",
    temporaryPasswordFor: (email: string) => `Temporary password for ${email}:`,
    temporaryPasswordHelp:
      "Shown only now: pass it on to the person, who will have to replace it on first sign-in.",
    select: "Select…",
    stripes: "Stripes",
    beltNotForAdmin:
      "Does not apply to a portal-only admin account: an admin holds no rank.",
    todayIfEmpty: "(today if empty)",
    role: "Role",

    filters: "Filters",
    name: "Name",
    searchByName: "Search by name",
    onlyActive: "Active members only",
    onlyActiveChip: "active only",
    filter: "Filter",
    reset: "Clear",

    noneFound: "No members found.",
    countAndPage: (total: number, page: number, pages: number) =>
      `${total} member${total === 1 ? "" : "s"} · page ${page} of ${pages}`,
    noMatch: "No member matches the chosen filters.",
    previous: "Previous",
    next: "Next",

    noAccount: "no account",
    trainingFor: (days: string) => `${days} of BJJ`,
    atCurrentBelt: (days: string) => `${days} at the current belt`,
    noActiveRole: "No active role",
    memberSince: " · since ",
    estimateSuffix: " (estimate)",

    rowActions: (name: string) => `Actions for ${name}`,
    details: "Details",
    invite: "Invite to the portal",
    resetPassword: "Reset password",
    resetPasswordConfirm: (name: string) =>
      `Give ${name} a new temporary password? The current password will stop working.`,
    revoke: "Revoke access",
    revokeConfirm: (name: string) =>
      `Revoke ${name}'s access? The record stays in the registry, but the person will no longer be able to sign in.`,

    backToRegistry: "Members",
    detailReadOnly:
      "Read only: with your instructor role this record cannot be edited.",
    personalSection: "Personal details",
    pathSection: "Progress",
    correctDates: "Correct the dates",
    correctDatesNote:
      "For fixing a date that is wrong, not for promoting: it records no promotion and changes neither belt nor stripes. Eligibility is measured from these two dates, so they are worth getting right.",
    notesSection: "Notes",
    rolesSection: "Roles",
    noRoles: "No role assigned.",
    roleRange: (from: string, to: string) => `from ${from} to ${to}`,
    roleOpen: (from: string) => `from ${from} · active`,
    totalHours: "Total hours",
    recordedHours: "Recorded hours",
    openingHours: "Opening hours (estimate)",
    trainingTime: "Training for",
    beltTime: "At this belt for",
    stripeTime: "Since the last stripe",
    openingBalanceExplained: (date: string, perWeek: number) =>
      `The opening hours cover only the period from joining to ${date}, calculated at ${perWeek} classes a week because no attendance history exists for those years. They are a starting balance and do not grow any more: from ${date} every hour comes only from the student's check-in or the instructor's roll call.`,
  },

  msg: {
    genericFailed: "The operation did not go through.",
    alreadyPresent: "You are already recorded as present at this lesson.",
    undoTooLate: "This check-in can no longer be undone.",
    checkinFailed:
      "The check-in could not be recorded. Try again; if it keeps failing, tell your instructor.",
    undoFailed:
      "The check-in could not be undone. Try again; if it keeps failing, tell your instructor.",
    restoreFailed: "The restore did not go through.",
    pickBelt: "Choose a belt.",
    pickRole: "Choose a role.",
    emailNeededToInvite:
      "An email address on the record is needed to invite this person.",
    resetFailed: "The reset did not go through.",
    cannotRevokeSelf: "You cannot revoke your own access.",
    revokeFailed: "The revocation did not go through.",
    nameEmpty: "The name cannot be empty.",
    profileNotFound: "Profile not found.",
    profileSaveFailed: "The profile could not be saved.",
    profileSaved: "Profile updated.",
    profileSavedEmailPending:
      "Profile saved. Confirm the new address from the link we have emailed you.",
    profileSavedEmailFailed: "Profile saved, but the email change did not go through.",
    passwordUpdated: "Password updated.",
    profileUnavailable: "Your profile is not available.",

    nameRequired: "The name is required.",
    emailRequired: "The email is required.",
    joinDateRequired: "The join date is required.",
    stripesRange: "Stripes must be a number from 0 to 4.",
    userNotSpecified: "No user specified.",
    userNotInGym: "This person is not part of your gym.",
    adminClientMissing: "The admin client is not available.",
    secretMissingCreate:
      "SUPABASE_SECRET_KEY is not configured: accounts cannot be created.",
    secretMissingInvite: "SUPABASE_SECRET_KEY is not configured: invitations are disabled.",
    secretMissingReset: "SUPABASE_SECRET_KEY is not configured: reset is disabled.",
    secretMissingRevoke: "SUPABASE_SECRET_KEY is not configured: revoking is disabled.",
    accountNotCreated:
      "Account not created: the email address may already be registered.",
    personAdded: (name: string) =>
      `${name} added to the registry. The account is active, with a temporary password to be changed on first sign-in.`,
    personAddedNoRole: (name: string) =>
      `${name} was added, but the role was not assigned.`,
    accountCreatedNoProfile: (email: string) =>
      `Account created for ${email}, but the record's details were not saved.`,
    inviteFailed: "The invitation failed. The address may already be registered.",
    inviteSent: (email: string) => `Invitation sent to ${email}.`,
    passwordReset: (who: string) =>
      `${who} has a new temporary password: they will be asked to change it on first sign-in.`,
    someUser: "the user",
    accessRevoked: "Access revoked. The record stays in the registry.",

    courseNameRequired: "The class name is required.",
    timesRequired: "Start and end times are required.",
    endBeforeStart: "The end time must be after the start time.",
    pickOneDay: "Choose at least one day of the week.",
    opensRange: "The check-in opening minutes must be between 0 and 1440.",
    closesRange: "The check-in closing minutes must be between 0 and 1440.",
    endDateBeforeStart: "The end date must be after the start date.",
    courseNotCreated: "Class not created.",
    courseNotSpecified: "No class specified.",
    courseNotFound: "Class not found.",
    courseUpdateFailed: "The change did not go through.",
    courseCreated: (name: string, lessons: number) =>
      `${name} created, ${lessons} lessons in the calendar.`,
    courseCreatedNoCalendar: (name: string) =>
      `${name} created, but the calendar was not generated.`,
    courseUpdated: (name: string) => `${name} updated and the calendar regenerated.`,
    courseUpdatedNoCalendar: "Class updated, but the calendar was not regenerated.",
    calendarExtended: (name: string, lessons: number) =>
      `${name}'s calendar extended to ${lessons} lessons.`,
    calendarNotExtended: "The calendar was not extended.",
    courseSuspended: "Class suspended.",
    courseReactivated: "Class reactivated.",
    courseDeleted: "Class deleted.",
    courseHasAttendance: "The class has recorded attendance: you can only suspend it.",
    deleteFailed: "The deletion did not go through.",

    sessionNotSpecified: "No lesson specified.",
    checkinClosed: "Check-in for this lesson is not open.",
    checkinRecorded: "Check-in recorded.",
    checkinUndone: "Check-in undone.",
    rollCallSaved: (present: number) => `Roll call saved: ${present} present.`,
    rollCallSavedKept: (present: number, kept: number) =>
      `Roll call saved: ${present} present. ${kept} check-in${kept === 1 ? "" : "s"} that arrived after you opened the roll call ${kept === 1 ? "was" : "were"} kept.`,
    rollCallPartial: "The roll call was only partly saved.",
    rollCallFailed: "The roll call was not saved.",
    instructorUpdated: "Instructor updated.",
    instructorNotUpdated: "The instructor was not updated.",
    lessonCancelled: "Lesson cancelled.",
    lessonRestored: "Lesson restored.",
    cancelFailed: "The cancellation did not go through.",

    promotionRecorded: "Promotion recorded",
    promotionFailed: "The promotion could not be recorded",
    promotionNotForward: "A promotion has to move forward, not back",
    datesSaved: "Progress dates updated",
    datesFailed: "The dates could not be updated",
    dateInFuture: "A date cannot be in the future",
    stripeBeforeBelt: "The last stripe cannot predate the belt change",
    criterionSaved: "Criterion updated",
    criterionFailed: "The criterion could not be saved",
  },

  corsi: {
    noDays: "no days",
    title: "Classes",
    lead:
      "The gym's recurring classes. The lesson calendar you see under Attendance follows from these.",
    loadFailed:
      "The classes could not be loaded. Check that the database migrations have been applied.",

    addCourse: "Add class",
    createCourse: "Create class",
    addHint:
      "Saving the class generates the lessons for the next eight weeks. Lessons already held are never touched. The instructor set here is the default: generated lessons inherit it, and it can still be changed on a single lesson from the roll call under Attendance.",

    courseName: "Class name",
    days: "Days",
    startTime: "Start",
    endTime: "End",
    hourAria: (label: string) => `${label}: hours`,
    minuteAria: (label: string) => `${label}: minutes`,
    activeFrom: "Active from",
    todayIfEmpty: "(today if empty)",
    activeUntil: "Until",
    neverEndsIfEmpty: "(no end if empty)",
    checkinBefore: "Check-in from (min before)",
    checkinAfter: "Check-in until (min after)",
    instructor: "Instructor",
    instructorDefault: "(class default)",
    currentInstructor: "Current instructor",
    description: "Description",

    suspended: "suspended",
    noInstructor: "no instructor",
    noUpcoming: "no upcoming lessons in the calendar",
    upcomingCount: (n: number) => `${n} lessons in the calendar`,
    checkinWindow: (before: number, after: number) =>
      ` · check-in from ${before} min before to ${after} min after`,

    rowActions: (name: string) => `Actions for ${name}`,
    extendCalendar: "Extend calendar",
    suspend: "Suspend",
    reactivate: "Reactivate",
    remove: "Delete",
    edit: "Edit",
    deleteConfirm: (name: string) =>
      `Delete ${name}? Only possible if it has no recorded attendance; otherwise you can suspend it.`,
    empty:
      "No classes yet. Create one above: the lessons appear under Attendance straight away.",

  },

  hours: {
    hours: (n: string) => `${n} hours`,
    estimateNote: (estimated: string, perWeek: number) =>
      `Includes ${estimated} opening hours, estimated at ${perWeek} classes a week since joining, for the period before attendance was tracked. From then on hours only grow through check-in or the roll call.`,
  },

  promotions: {
    queueTitle: "Minimums met",
    queueIntro:
      "Who has met the time and hour minimums for their next grade. It is a suggestion: the assessment stays with the instructor.",
    queueEmpty: "Nobody has met the minimums right now.",
    eligibleCount: (n: number) => (n === 1 ? "1 person" : `${n} people`),
    hoursNote: "Mat hours, counted at 1 hour a lesson",
    atCurrentRank: "Hours at the current grade",
    criteriaTitle: "Criteria",
    criteriaPageTitle: "Graduation Criteria",
    criteriaIntro:
      "Minimum hours and time for each grade. The belt figures come from the IBJJF minimums and common practice; the stripe figures are a starting estimate, meant to be tuned for this gym.",
    minHours: "Minimum hours",
    minDays: "Minimum days",
    minAge: "Minimum age",
    criterionNotes: "Notes",
    save: "Save",
    promote: "Promote",
    promoteTitle: (name: string) => `Promote ${name}`,
    targetBelt: "New belt",
    targetStripes: "Stripes",
    promotedOn: "Promotion date",
    promotionNotes: "Notes",
    confirm: "Record promotion",
    history: "Promotion history",
    historyEmpty: "No promotion recorded.",
    historyEntry: (from: string, to: string) => `From ${from} to ${to}`,
    promotedBy: (name: string) => `Recorded by ${name}`,
    remindersTitle: "To assess on the mat",
    remindersNote: "A reminder, not a checklist: none of this is saved.",
    reminders: {
      blue: [
        "Basic offence and defence from guard, mount, side control and back control",
        "Survives sparring without being submitted easily",
        "Follows the safety rules: taps in time, controls submissions",
        "Basic mat etiquette",
        "Respect for training partners",
      ],
      purple: [
        "A recognisable personal game, with preferred positions and sequences",
        "Solid guard passing, submissions and transitions",
        "Holds their own against equal and higher belts",
        "Consistent training",
        "Reliable around the academy",
      ],
      brown: [
        "A mature technical game",
        "Chains techniques fluidly",
        "Advanced positional control",
        "Can correct and help lower belts",
        "Contributes actively to the academy",
        "Mentors or assists with teaching",
      ],
      black: [
        "Adapts their game to different opponent styles",
        "Able to teach the full curriculum",
        "Overall martial maturity",
        "Leadership sustained over time",
        "Humility and respect for the tradition",
        "Long-term dedication to the art and the academy",
      ],
    },
  },

  cookieNotice: {
    text: "This site uses only technical cookies, needed to keep your session open and remember the language you chose. No profiling cookies, no analytics services.",
    more: "Privacy and cookies",
    accept: "Got it",
  },

  privacy: {
    title: "Privacy and cookies",
    updated: (date: string) => `Last updated: ${date}`,
    lead:
      "This page explains which personal data Faixa BJJ collects, why, how long it is kept and what rights you have over it.",
    draftTitle: "Draft document",
    draftBody:
      "The application is in testing and no data controller has been designated yet. Before any use with real people's data, the controller's name, address and contact must be filled in, and the retention periods below must be reviewed.",
    sections: [
      {
        heading: "1. Data controller",
        paragraphs: [
          "The data controller is [GYM NAME], with registered office at [FULL ADDRESS], reachable at [CONTACT EMAIL].",
          "No Data Protection Officer has been appointed: the processing does not fall within the cases where Article 37 GDPR makes one mandatory. If the gym appoints one, their contact details belong here.",
          "Faixa BJJ hosts several gyms. Each gym is the controller of its members' data; the portal's operator processes it on the gym's behalf (processor) and does not access students', attendance or promotion data.",
        ],
      },
      {
        heading: "2. What data we process",
        paragraphs: [
          "Contact and identity data: name, email, phone number, date of birth. Name and email are required to create an account; phone and date of birth are optional.",
          "Technical progression data: belt, number of stripes, date of the last belt promotion, date of the last stripe, join date, role held at the gym and its history.",
          "Attendance data: present or absent for each lesson, recording whether the presence was entered by the member (check-in) or by the instructor (roll call).",
          "Device location: if the gym has set its location, at check-in the browser asks for your phone's. It is used only to check that you are within 50 m of the gym: it is compared and discarded, never stored or written to logs. The browser asks for permission according to its settings; refusing only prevents checking yourself in, since the instructor can always record your attendance in the roll call.",
          "Free-text notes: a field staff can fill in. It must not be used for special categories of data under Article 9 GDPR — health or injuries in particular — because this notice does not cover that kind of processing.",
          "Access data: credentials handled by the authentication provider (passwords are stored only as hashes, never in clear text) and the service's technical logs.",
        ],
      },
      {
        heading: "3. Why we process it, and on what legal basis",
        paragraphs: [
          "Managing membership and the relationship with the gym, recording attendance and counting training hours: performance of the contract or membership relationship to which the person is party (Art. 6(1)(b) GDPR).",
          "Assessing eligibility for stripes and belts and keeping the history of technical progression: the gym's legitimate interest in documenting its members' technical path (Art. 6(1)(f) GDPR). The promotion decision always remains the instructor's: the application promotes nobody automatically.",
          "Keeping access to the portal secure: legitimate interest in protecting accounts and data (Art. 6(1)(f) GDPR).",
          "We carry out no profiling and no automated decision-making producing legal effects on the person.",
        ],
      },
      {
        heading: "4. Who can see the data",
        paragraphs: [
          "Access is limited by role, and the limit is enforced by the database itself, not only by the interface. A student sees their own data and the lesson calendar. An instructor sees the member list read-only and manages courses and attendance. Head coach and admin have full access and can manage accounts.",
          "No data is sold or handed to third parties for marketing purposes.",
        ],
      },
      {
        heading: "5. How long we keep it",
        paragraphs: [
          "Membership data and attendance history are kept for the whole duration of the relationship with the gym and for [NUMBER] years afterwards, a period to be set according to the applicable civil and tax obligations.",
          "Revoking portal access deletes the sign-in credentials but keeps the person's record and their attendance history: they are the gym's technical register. Full deletion can be requested as described in point 7.",
        ],
      },
      {
        heading: "6. Where the data is and who it is shared with",
        paragraphs: [
          "Data is stored on Supabase (database, authentication and storage) and the site is published on Vercel. Both act as processors under Article 28 GDPR.",
          "The project is configured on infrastructure within the European Union. Where a provider processes data outside the European Economic Area, the transfer relies on the Standard Contractual Clauses adopted by the European Commission.",
        ],
      },
      {
        heading: "7. Your rights",
        paragraphs: [
          "You may at any time request access to your data, its rectification or erasure, restriction of processing, portability, and you may object to processing based on legitimate interest (Articles 15 to 22 GDPR).",
          "Some corrections are immediate: from the Account page you can change your own name, email, phone, date of birth and notes. Belt, stripes and promotion dates are deliberately read-only, because promotion is the instructor's decision: to correct them, write to the controller.",
          "To exercise your rights write to [CONTACT EMAIL]. If you believe the processing breaches the rules you may lodge a complaint with your national supervisory authority — in Italy, the Garante per la protezione dei dati personali (www.garanteprivacy.it).",
        ],
      },
      {
        heading: "8. Security",
        paragraphs: [
          "Access is through a personal account with a password. Passwords are stored only as hashes. The separation between what each role may read and write is enforced by the database through Row Level Security policies, so it holds for any request, including one that never goes through the interface.",
        ],
      },
    ],
    cookieHeading: "9. Cookies and local storage",
    cookieIntro:
      "Faixa BJJ uses only technical cookies and local storage, needed either to run the service or to remember a preference the user expressed. We use no profiling cookies, no analytics or advertising tools, and no third-party cookies. Such tools require no prior consent under the ePrivacy Directive: that is why the banner informs you rather than asking for permission.",
    cookieTable: {
      name: "Name",
      type: "Type",
      purpose: "Purpose",
      duration: "Duration",
    },
    cookies: [
      {
        name: "sb-<project>-auth-token",
        type: "Technical cookie",
        purpose: "Keeps you signed in. Without it, staying authenticated is impossible.",
        duration: "Until the session expires or you sign out",
      },
      {
        name: "faixabjj-locale",
        type: "Technical cookie (preference)",
        purpose: "Remembers the language you chose.",
        duration: "1 year",
      },
      {
        name: "theme",
        type: "Local storage",
        purpose: "Remembers your choice between the light and the dark theme.",
        duration: "Until you clear the site's data",
      },
      {
        name: "faixabjj-cookie-notice",
        type: "Local storage",
        purpose: "Remembers that this notice has already been shown.",
        duration: "Until you clear the site's data",
      },
    ],
    cookieRemoval:
      "You can delete cookies and local storage from your browser settings. Deleting the session cookie signs you out; deleting the others leaves the application working and back on its defaults.",
  },
  gyms: {
    title: "Gyms",
    subtitle: "The gyms hosted by the portal. Here you see each gym's details and its managers, never students, attendance or promotions.",
    newGym: "New gym",
    search: "Search by name",
    filter: "Filter",
    allStatuses: "All statuses",
    status: { active: "Active", suspended: "Suspended" },
    empty: "No gyms found.",
    counts: (people: number, courses: number, managers: number) =>
      `${people} active people · ${courses} courses · ${managers} managers`,
    createdOn: (date: string) => `Created on ${date}`,
    rowMenu: "Gym actions",
    details: "Details",
    suspend: "Suspend",
    reactivate: "Reactivate",
    confirmSuspend: (name: string) =>
      `Suspend ${name}? None of its accounts can use the portal until you reactivate it.`,
    confirmReactivate: (name: string) => `Reactivate ${name}?`,
    back: "Gyms",
    fields: {
      name: "Gym name",
      timezone: "Timezone",
      trackingStartedOn: "Attendance tracking start",
      trackingHelp: "Before this date hours are estimated; from this date attendance is counted. It cannot be in the future.",
      sessionLengthHours: "Lesson length (hours)",
      lessonsPerWeek: "Lessons per week, for estimating earlier hours",
      latitude: "Latitude",
      longitude: "Longitude",
      locationHelp:
        "Optional. With a location set, members can check in only within 50 m of the gym. In Google Maps: right-click the spot and copy the coordinates.",
      openMap: "Check on the map ↗",
    },
    create: "Create gym",
    settings: "Settings",
    settingsWarning: "Changing the timezone or the start date moves the check-in windows and the estimated hours of every member of this gym.",
    save: "Save settings",
    managers: "Managers",
    managersHelp: "Managers run the gym: they create head coaches, instructors and students. They hold no belt.",
    noManagers: "No managers: nobody can get into this gym yet.",
    addManager: "Add manager",
    managerName: "Full name",
    managerEmail: "Email",
    managerMenu: "Manager actions",
    managerSince: (date: string) => `Manager since ${date}`,
    noAccount: "no account",
    resetPassword: "Reset password",
    confirmReset: (email: string) =>
      `Give ${email} a new temporary password? They will have to change it at their next login.`,
    revoke: "Revoke access",
    confirmRevoke: (email: string) =>
      `Revoke ${email}'s access? The account is deleted; the person stays in the gym's registry.`,
    danger: "Danger zone",
    dangerHelp: "Deleting erases the gym, all its data (people, courses, attendance, promotions) and all its accounts. It cannot be undone.",
    dangerNeedsSuspension: "Suspend the gym before you can delete it.",
    confirmName: (name: string) => `Type “${name}” to confirm`,
    delete: "Delete permanently",
    confirmDelete: (name: string) => `Permanently delete ${name} and all its data?`,
    invalid: {
      name: "The name is required (120 characters at most).",
      timezone: "Choose a timezone from the list.",
      trackingStartedOn: "The start date must be a valid date, not in the future.",
      sessionLengthHours: "The lesson length must be between 0 and 8 hours.",
      lessonsPerWeek: "Lessons per week must be between 0 and 14.",
      location:
        "Enter both latitude and longitude as numbers: latitude between −90 and 90, longitude between −180 and 180.",
    },
    msg: {
      created: (name: string) => `${name} created. Now add its first manager.`,
      saved: "Settings saved.",
      nameTaken: "A gym with this name already exists.",
      failed: "The operation did not succeed. Try again.",
      suspended: (name: string) => `${name} is suspended.`,
      reactivated: (name: string) => `${name} is active again.`,
      deleted: (name: string) => `${name} has been deleted.`,
      deleteNeedsSuspension: "Suspend the gym before deleting it.",
      deleteNameMismatch: "The name you typed does not match.",
      accountsNotDeleted: (n: number) =>
        `Gym deleted, but ${n} accounts were not removed: delete them from the Supabase dashboard.`,
      managerAdded: (email: string) =>
        `Manager ${email} created with a temporary password: they will change it at first login.`,
      managerFailed: "Could not create the manager: the email may already be in use.",
      managerMissing: "Name and email are required.",
      notAManager: "This person is not a manager of this gym.",
      passwordReset: (email: string) => `${email}'s password has been reset.`,
      revoked: (email: string) => `${email}'s access has been revoked.`,
      secretMissing: "Service key not configured: account operations are unavailable.",
    },
  },
};
