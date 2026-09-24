"use client";

import { useState } from "react";

import { geoFailure, mapUrl, type GeoFailure } from "@/utils/checkin";

const fieldClass =
  "rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent";

export type LocationFieldsLabels = {
  latitude: string;
  longitude: string;
  help: string;
  openMap: string;
  useCurrent: string;
  locating: string;
  geo: Record<GeoFailure, string>;
};

// Latitude and longitude of a gym, for the superadmin's gym form and the
// manager's /gym page. "Use my current location" fills both from the phone —
// the most precise way, standing in the gym. The server re-validates the pair
// (parseLocation, then the gym_location_valid constraint).
export function LocationFields({
  defaults,
  labels,
}: {
  defaults: { latitude: number | null; longitude: number | null };
  labels: LocationFieldsLabels;
}) {
  const [latitude, setLatitude] = useState(defaults.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(defaults.longitude?.toString() ?? "");
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [failure, setFailure] = useState<GeoFailure | null>(null);

  function fillFromDevice() {
    setFailure(null);
    if (!("geolocation" in navigator)) {
      setFailure("unsupported");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setAccuracy(Math.round(position.coords.accuracy));
      },
      (error) => {
        setLocating(false);
        setFailure(geoFailure(error.code));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  const lat = Number(latitude.replace(",", "."));
  const lng = Number(longitude.replace(",", "."));
  const showMap =
    latitude.trim() !== "" &&
    longitude.trim() !== "" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);

  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="latitude" className="text-sm font-medium">{labels.latitude}</label>
        <input
          id="latitude"
          name="latitude"
          inputMode="decimal"
          autoComplete="off"
          value={latitude}
          onChange={(e) => setLatitude(e.target.value)}
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="longitude" className="text-sm font-medium">{labels.longitude}</label>
        <input
          id="longitude"
          name="longitude"
          inputMode="decimal"
          autoComplete="off"
          value={longitude}
          onChange={(e) => setLongitude(e.target.value)}
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <p className="text-xs text-foreground/55">{labels.help}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={fillFromDevice}
            disabled={locating}
            className="rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-40"
          >
            {locating ? labels.locating : labels.useCurrent}
          </button>
          {accuracy !== null ? (
            <span className="text-xs text-foreground/55">± {accuracy} m</span>
          ) : null}
          {showMap ? (
            <a
              href={mapUrl(lat, lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-accent hover:opacity-80"
            >
              {labels.openMap}
            </a>
          ) : null}
        </div>
        {failure ? (
          <p role="alert" className="text-xs text-accent">{labels.geo[failure]}</p>
        ) : null}
      </div>
    </div>
  );
}
