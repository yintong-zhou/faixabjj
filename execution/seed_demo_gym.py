"""Create (or recreate from scratch) the fictional demo gym.

Run before every demo: it deletes the gym named DEMO_GYM (the cascade removes
every row in it) and its auth accounts, then builds it again — people with
adult and children's belts, roles, three courses, sixteen weeks of past lessons
with attendance, and a few members past the promotion thresholds.

    python execution/seed_demo_gym.py            # recreate
    python execution/seed_demo_gym.py --delete   # remove it and stop

Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY from frontend/.env.local
(the environment wins). The two demo accounts get the password in
DEMO_PASSWORD, or one typed at the prompt; no forced change, so the demo does
not stop on /change-password.

Safety: the only gym this script reads, deletes or writes is the one named
DEMO_GYM. Every insert names its gym_id — with the service role there is no
caller, and the gym_scope trigger would put a row without one in the first gym,
the real one. Platform admin accounts are never deleted.

Stdlib only (urllib), so there is nothing to install.
"""

import getpass
import json
import os
import random
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

DEMO_GYM = "Accademia Demo BJJ"
ACCOUNT_DOMAIN = "example.com"  # RFC 2606: reserved, no mail ever reaches anyone
WEEKS_PAST = 16  # tracking_started_on is this far back; lessons fill the gap
DAYS_AHEAD = 56  # like the app, which generates eight weeks of lessons

TODAY = date.today()
TRACKING_START = TODAY - timedelta(weeks=WEEKS_PAST)


def ago(days):
    return TODAY - timedelta(days=days)


# --- roster -----------------------------------------------------------------
# Days are "days ago". rank = belt date, stripe = last stripe date (both default
# to the joining day). rate = lessons a week. With the gym's default criteria
# (session 1 h, estimate 3 lessons a week before tracking) the five marked
# READY are past their next threshold; the rest are short of it on purpose.
def person(name, age, belt, stripes, joined, rank=None, stripe=None,
           roles=("student",), rate=2.5, stop=0, kid=False, account=None):
    rank = joined if rank is None else rank
    return dict(name=name, age=age, belt=belt, stripes=stripes, joined=joined,
                rank=rank, stripe=rank if stripe is None else stripe,
                roles=roles, rate=rate, stop=stop, kid=kid, account=account)


ROSTER = [
    # Staff: head coach, instructor, assistant.
    person("Rafael Almeida", 41, "black", 0, 2900, rank=1500, roles=("head_coach",),
           account="demo.coach"),
    person("Giulia Romano", 33, "brown", 2, 2400, rank=500, stripe=60, roles=("instructor",), rate=2),
    person("James Carter", 29, "purple", 1, 1600, rank=400, stripe=70,
           roles=("assistant", "student"), rate=3),
    # Adults.
    person("Lucas Ferreira", 27, "white", 4, 420, stripe=100, rate=3),  # READY: blue
    person("Emily Walsh", 31, "blue", 4, 1100, rank=800, stripe=150, rate=2.5),  # READY: purple
    person("Paolo Moretti", 36, "purple", 4, 1900, rank=600, stripe=130, rate=2.5),  # READY: brown
    person("Elena Russo", 24, "white", 1, 250, stripe=90, rate=3, account="demo.allievo"),  # READY: stripe
    person("Thiago Nascimento", 30, "blue", 2, 700, rank=300, stripe=100, rate=2.5),  # READY: stripe
    person("Sophie Bennett", 22, "white", 4, 160, stripe=60, rate=3),
    person("Matteo Bruno", 19, "white", 0, 20, rate=3),
    person("Camila Souza", 28, "blue", 0, 500, rank=50, rate=3),
    person("Daniel Hughes", 38, "purple", 0, 1500, rank=80, rate=2),
    person("Giorgio Lombardi", 44, "brown", 0, 2600, rank=100, rate=2),
    person("Beatriz Oliveira", 21, "white", 1, 200, stripe=100, rate=1),
    person("Oliver Grant", 32, "blue", 3, 900, rank=400, stripe=40, rate=2.5, stop=21),
    # Children.
    person("Tommaso Ferri", 9, "gray_white", 2, 400, rank=250, stripe=80, rate=1.5, kid=True),
    person("Ana Clara Costa", 11, "yellow", 1, 700, rank=200, stripe=60, rate=1.5, kid=True),
    person("Noah Mitchell", 7, "white", 3, 300, stripe=50, rate=1.5, kid=True),
    person("Aurora Mancini", 13, "orange_white", 0, 900, rank=120, rate=1.5, kid=True),
    person("Gabriel Santos", 14, "green_white", 1, 1200, rank=220, stripe=70, rate=1.5, kid=True),
]

# key: (name, ISO weekdays, start, end, default instructor). "kids" is the
# children's class; the other two regular ones are the adults'.
COURSES = {
    "gi": ("Adulti Gi", [1, 3, 5], "19:00", "20:00", "Rafael Almeida"),
    "nogi": ("No-Gi", [2, 4], "20:00", "21:00", "Rafael Almeida"),
    "kids": ("Bambini", [2, 4], "17:30", "18:30", "Giulia Romano"),
    # Always open for check-in (00:00–23:59), so the QR works at any hour of a
    # demo. Starts today: it has no past lessons to skew the charts.
    "open": ("Open mat", [1, 2, 3, 4, 5, 6, 7], "12:00", "13:00", "Rafael Almeida"),
}


# --- Supabase REST ----------------------------------------------------------
def load_env():
    env = {}
    path = Path(__file__).resolve().parent.parent / "frontend" / ".env.local"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and not key.strip().startswith("#"):
                env[key.strip()] = value.strip().strip('"')
    env.update(os.environ)
    try:
        return env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"), env["SUPABASE_SECRET_KEY"], env
    except KeyError as missing:
        sys.exit(f"Missing {missing} (frontend/.env.local or environment).")


URL, KEY, ENV = load_env()


def call(method, path, body=None, prefer="return=representation"):
    headers = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
               "Content-Type": "application/json", "Prefer": prefer}
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(URL + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as err:
        sys.exit(f"{method} {path.split('?')[0]} failed: {err.code} {err.read().decode()}")


def q(value):
    return urllib.parse.quote(str(value), safe="")


def insert(table, rows):
    out = []
    for i in range(0, len(rows), 500):  # PostgREST takes a JSON array per request
        out += call("POST", f"/rest/v1/{table}", rows[i:i + 500])
    return out


# --- reset ------------------------------------------------------------------
def delete_demo_gym():
    gyms = call("GET", f"/rest/v1/gym?select=id&name=eq.{q(DEMO_GYM)}")
    if not gyms:
        print(f"No gym named {DEMO_GYM!r}.")
        return
    gym_id = gyms[0]["id"]
    # Read the accounts before the delete: its cascade erases the person rows,
    # the only record of which accounts belong to this gym.
    people = call("GET", f"/rest/v1/person?select=auth_user_id&gym_id=eq.{gym_id}&auth_user_id=not.is.null")
    pending = call("GET", f"/rest/v1/registration_request?select=auth_user_id&gym_id=eq.{gym_id}")
    admins = {r["auth_user_id"] for r in call("GET", "/rest/v1/platform_admin?select=auth_user_id")}
    accounts = {r["auth_user_id"] for r in people + pending} - admins

    call("DELETE", f"/rest/v1/gym?id=eq.{gym_id}&name=eq.{q(DEMO_GYM)}")
    for user_id in accounts:
        call("DELETE", f"/auth/v1/admin/users/{user_id}")
    print(f"Deleted {DEMO_GYM!r} and {len(accounts)} account(s).")


# --- build ------------------------------------------------------------------
def weekdays_between(weekdays, start, end):
    """Dates in [start, end] that fall on the given ISO weekdays."""
    days = (end - start).days + 1
    return [start + timedelta(d) for d in range(days)
            if (start + timedelta(d)).isoweekday() in weekdays]


def birth_date(rng, age):
    return (TODAY - timedelta(days=round(age * 365.25) + rng.randint(10, 300))).isoformat()


def build(password):
    rng = random.Random(42)  # same gym every run

    gym = insert("gym", [{
        "name": DEMO_GYM, "timezone": "Europe/Rome",
        "tracking_started_on": TRACKING_START.isoformat(),
        "session_length_hours": 1, "lessons_per_week": 3,
    }])[0]
    gym_id = gym["id"]

    rows = []
    for p in ROSTER:
        joined = ago(p["joined"])
        # created_at no later than the joining day or the go-live, whichever is
        # later: estimateCutoff() reads it, and a record dated today would
        # estimate every week up to today on top of the recorded lessons.
        created = max(joined, TRACKING_START)
        rows.append({
            "gym_id": gym_id, "full_name": p["name"],
            "email": f"{p['account']}@{ACCOUNT_DOMAIN}" if p["account"] else None,
            "username": p["account"],
            "birth_date": birth_date(rng, p["age"]), "joined_at": joined.isoformat(),
            "current_belt": p["belt"], "current_stripes": p["stripes"],
            "rank_since": ago(p["rank"]).isoformat(), "stripe_since": ago(p["stripe"]).isoformat(),
            "created_at": f"{created.isoformat()}T12:00:00Z",
        })
    ids = {r["full_name"]: r["id"] for r in insert("person", rows)}

    insert("assigned_role", [
        {"gym_id": gym_id, "person_id": ids[p["name"]], "role": role,
         "start_date": ago(p["joined"]).isoformat()}
        for p in ROSTER for role in p["roles"]
    ])

    courses = {}
    for key, (name, weekdays, start, end, instructor) in COURSES.items():
        always_open = key == "open"
        courses[key] = insert("course", [{
            "gym_id": gym_id, "name": name, "weekdays": weekdays,
            "start_time": start, "end_time": end,
            "starts_on": (TODAY if always_open else TRACKING_START).isoformat(),
            "instructor_id": ids[instructor],
            "checkin_opens_minutes_before": 720 if always_open else 60,
            "checkin_closes_minutes_after": 659 if always_open else 30,
        }])[0]["id"]

    sessions = []
    for key, (name, weekdays, start, end, instructor) in COURSES.items():
        first = TODAY if key == "open" else TRACKING_START
        for day in weekdays_between(weekdays, first, TODAY + timedelta(DAYS_AHEAD)):
            sessions.append({
                "gym_id": gym_id, "course_id": courses[key], "session_date": day.isoformat(),
                "start_time": start, "end_time": end, "instructor_id": ids[instructor],
                "status": "scheduled",
            })
    # One lesson cancelled five weeks ago, as gyms do on a holiday.
    cancelled = next(s for s in sessions if s["course_id"] == courses["gi"]
                     and s["session_date"] >= ago(35).isoformat())
    cancelled["status"] = "cancelled"
    sessions = insert("class_session", sessions)

    # Past lessons only: today's are left for the live roll call and check-in.
    course_key = {v: k for k, v in courses.items()}
    attendance = []
    for s in sessions:
        day = date.fromisoformat(s["session_date"])
        if day >= TODAY or s["status"] == "cancelled":
            continue
        key = course_key[s["course_id"]]
        for p in ROSTER:
            pid = ids[p["name"]]
            teaching = pid == s["instructor_id"]  # the instructor counts as present
            if not teaching and (p["kid"] != (key == "kids")
                                 or day < ago(p["joined"]) or day > ago(p["stop"])):
                continue
            per_session = p["rate"] / (2 if p["kid"] else 5)
            if teaching or rng.random() < per_session:
                self_checkin = not (teaching or p["kid"]) and rng.random() < 0.5
                attendance.append({"gym_id": gym_id, "person_id": pid, "session_id": s["id"],
                                   "present": True,
                                   "checked_in_by": "self" if self_checkin else "staff"})
    insert("attendance", attendance)

    # The stripes awarded since go-live, so the history panel is not empty.
    promotions = [
        {"gym_id": gym_id, "person_id": ids[p["name"]], "from_belt": p["belt"],
         "from_stripes": p["stripes"] - 1, "to_belt": p["belt"], "to_stripes": p["stripes"],
         "promoted_on": ago(p["stripe"]).isoformat(), "promoted_by": ids["Rafael Almeida"]}
        for p in ROSTER
        if p["stripes"] > 0 and ago(p["stripe"]) >= TRACKING_START and p["name"] != "Rafael Almeida"
    ]
    insert("promotion", promotions)

    # Accounts last: the auth trigger links each to the person row with the
    # same email in this gym (app_metadata.gym_id), as approval does.
    for p in (p for p in ROSTER if p["account"]):
        email = f"{p['account']}@{ACCOUNT_DOMAIN}"
        user = call("POST", "/auth/v1/admin/users", {
            "email": email, "password": password, "email_confirm": True,
            "user_metadata": {"full_name": p["name"]}, "app_metadata": {"gym_id": gym_id},
        })
        linked = call("GET", f"/rest/v1/person?select=id&auth_user_id=eq.{user['id']}&gym_id=eq.{gym_id}")
        if not linked:
            sys.exit(f"Account {email} created but not linked to its person row.")

    print(f"Created {DEMO_GYM!r}: {len(ROSTER)} people, {len(courses)} courses, "
          f"{len(sessions)} lessons, {len(attendance)} attendances, {len(promotions)} promotions.")
    print("Log in as " + ", ".join(p["account"] for p in ROSTER if p["account"]) + ".")


def main():
    print(f"Project: {URL}")
    delete_demo_gym()
    if "--delete" in sys.argv:
        return
    password = ENV.get("DEMO_PASSWORD") or getpass.getpass("Password for the demo accounts: ")
    if len(password) < 8:
        sys.exit("Password too short (8+ characters).")
    build(password)


if __name__ == "__main__":
    main()
