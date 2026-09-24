"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { geoFailure, type GeoFailure } from "@/utils/checkin";

import { checkIn } from "./actions";

export type CheckinButtonLabels = {
  checkIn: string;
  locating: string;
  sending: string;
  retry: string;
  geo: Record<GeoFailure, string>;
};

// The member's check-in button. When the gym has a position it first asks the
// browser for the phone's (the only moment it is read), then posts the same
// server action the plain form used; the database decides. When the gym has
// none, it posts straight away and the browser never asks.
export function CheckinButton({
  sessionId,
  query,
  returnTo,
  needsLocation,
  auto = false,
  disabled = false,
  labels,
  className,
}: {
  sessionId: string;
  query: string;
  returnTo: "/attendance" | "/check-in";
  needsLocation: boolean;
  auto?: boolean;
  disabled?: boolean;
  labels: CheckinButtonLabels;
  className?: string;
}) {
  const [locating, setLocating] = useState(false);
  const [failure, setFailure] = useState<GeoFailure | null>(null);
  const [sending, startTransition] = useTransition();
  const autoStarted = useRef(false);

  function send(position?: GeolocationPosition) {
    const form = new FormData();
    form.set("session_id", sessionId);
    form.set("_query", query);
    form.set("_return", returnTo);
    if (position) {
      form.set("lat", String(position.coords.latitude));
      form.set("lng", String(position.coords.longitude));
      form.set("accuracy", String(position.coords.accuracy));
    }
    startTransition(async () => {
      await checkIn(form);
    });
  }

  function start() {
    setFailure(null);
    if (!needsLocation) {
      send();
      return;
    }
    if (!("geolocation" in navigator)) {
      setFailure("unsupported");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        send(position);
      },
      (error) => {
        setLocating(false);
        setFailure(geoFailure(error.code));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  // The QR page with a single open lesson checks in without a tap. Once per
  // mount: the ref survives the development double-invoke of effects.
  useEffect(() => {
    if (!auto || autoStarted.current) return;
    autoStarted.current = true;
    start();
    // start() is recreated every render; the ref makes this run once anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const busy = locating || sending;
  const label = locating
    ? labels.locating
    : sending
      ? labels.sending
      : failure
        ? labels.retry
        : labels.checkIn;

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={start}
        disabled={busy || disabled}
        aria-busy={busy}
        className={
          className ??
          "rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        }
      >
        {label}
      </button>
      {failure ? (
        <p role="alert" className="max-w-xs text-right text-xs leading-snug text-accent">
          {labels.geo[failure]}
        </p>
      ) : null}
    </div>
  );
}
