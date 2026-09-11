"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  CalendarCheckIcon,
  DashboardIcon,
  HomeIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";

const HOME_ITEM = { href: "/", label: "Home", icon: HomeIcon } as const;
const STAFF_ITEMS = [
  { href: "/registro", label: "Registro", icon: UsersIcon },
  { href: "/presenze", label: "Presenze", icon: CalendarCheckIcon },
] as const;
const DASHBOARD_ITEM = {
  href: "/dashboard",
  label: "Dashboard",
  icon: DashboardIcon,
} as const;
const ACCOUNT_ITEM = { href: "/account", label: "Account", icon: UserIcon } as const;

// Hiding a link is a convenience, never the access control: /registro,
// /presenze and /account/utenti each verify the privilege themselves, and the
// RLS policies verify it again in the database.
function navItemsFor(isLoggedIn: boolean, canViewRegistry: boolean) {
  if (!isLoggedIn) {
    // Home is the whole menu for a visitor: every other section requires a
    // session, so offering them only produces a bounce through /login.
    return [HOME_ITEM];
  }

  // Home is deliberately absent for *every* signed-in user, staff included —
  // it is the landing page for people who arrive without logging in, and the
  // proxy redirects an authenticated visitor away from it.
  return canViewRegistry
    ? [...STAFF_ITEMS, DASHBOARD_ITEM, ACCOUNT_ITEM]
    : [DASHBOARD_ITEM, ACCOUNT_ITEM];
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function NavShell({
  children,
  isLoggedIn,
  canViewRegistry,
}: {
  children: ReactNode;
  isLoggedIn: boolean;
  canViewRegistry: boolean;
}) {
  const pathname = usePathname();
  const navItems = navItemsFor(isLoggedIn, canViewRegistry);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          {/* Signed in, the logo goes to the dashboard rather than to "/",
              which would only bounce through the proxy's redirect. */}
          <Link
            href={isLoggedIn ? "/dashboard" : "/"}
            className="flex items-center gap-2.5"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary p-1.5">
              <Image
                src="/faixabjj_only-removebg-preview.png"
                alt=""
                width={500}
                height={500}
                priority
                className="h-full w-full object-contain"
              />
            </span>
            <span className="font-heading text-lg font-bold tracking-tight">
              FAIXABJJ
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <nav className="hidden gap-1 sm:flex">
              {navItems.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    isActive(pathname, href)
                      ? "bg-foreground text-background"
                      : "text-foreground/70 hover:bg-neutral-light/60"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </nav>
            {isLoggedIn ? (
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="rounded-full px-4 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-neutral-light/60"
                >
                  Esci
                </button>
              </form>
            ) : (
              <Link
                href="/login"
                className="rounded-full px-4 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-neutral-light/60"
              >
                Accedi
              </Link>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-24 pt-6 sm:px-8 sm:pb-10">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur sm:hidden">
        <div className="flex items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium ${
                  active ? "text-accent" : "text-foreground/55"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
