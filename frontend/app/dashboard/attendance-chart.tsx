"use client";

import { useState, type PointerEvent } from "react";

// One bar of the chart. Every string is composed on the server, in the
// reader's language: this component holds no dictionary, only which bar is
// being looked at.
export type ChartDay = {
  date: string;
  total: number;
  isFuture: boolean;
  // The label under the bar, or null when this day is not labelled (a month
  // has 31 columns and room for a handful of numbers).
  tick: string | null;
  // "Giovedì 01/10/2026 · 12 presenti" split in two, so the readout can set the
  // day apart from the figure.
  heading: string;
  value: string;
};

export type AttendanceChartLabels = {
  // Names the chart for a screen reader: what it counts and over which period.
  summary: string;
  // Shown while no bar is selected.
  hint: string;
};

const PLOT_HEIGHT = "h-40";

// Presences per day as bars: one series, one axis, so one colour. It is the
// accent token, the same one the belt chart uses, which already holds in both
// themes.
//
// Reading a bar: hover it, tap it, or drag a finger along the chart. A 31-day
// month leaves each column about 8 px on a phone — too narrow to aim at — so
// the pointer is read on the whole plot and mapped to the nearest column,
// rather than on the bars. The bars are still buttons, so a keyboard (or a
// screen reader) reaches every day and hears its value.
export function AttendanceChart({
  days,
  max,
  today,
  labels,
}: {
  days: ChartDay[];
  max: number;
  today: string;
  labels: AttendanceChartLabels;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  // Today when it is on screen, so the chart opens on the figure people look
  // for first; nothing otherwise.
  const selected = days.find((day) => day.date === (picked ?? today)) ?? null;

  function pick(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    const index = Math.min(
      days.length - 1,
      Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * days.length)),
    );
    setPicked(days[index].date);
  }

  const ticks = [max, max / 2, 0];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 sm:p-4">
      {/* aria-live: a keyboard user moving along the bars hears each one. */}
      <p aria-live="polite" className="min-h-10 text-sm leading-snug sm:min-h-5">
        {selected ? (
          <>
            <span className="font-medium">{selected.heading}</span>
            <span className="text-foreground/70"> · {selected.value}</span>
          </>
        ) : (
          <span className="text-foreground/55">{labels.hint}</span>
        )}
      </p>

      <div className="flex gap-2" role="group" aria-label={labels.summary}>
        <div
          className={`relative ${PLOT_HEIGHT} w-6 shrink-0 text-right text-[0.7rem] tabular-nums leading-none text-foreground/55`}
          aria-hidden="true"
        >
          {ticks.map((value, index) => (
            <span
              key={index}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${(index / (ticks.length - 1)) * 100}%` }}
            >
              {value}
            </span>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* touch-pan-y: a horizontal drag scrubs the bars, a vertical one still
              scrolls the page. */}
          <div
            className={`relative ${PLOT_HEIGHT} touch-pan-y`}
            onPointerDown={pick}
            onPointerMove={pick}
          >
            {/* Recessive grid: three hairlines, the baseline the strongest. */}
            {ticks.map((_, index) => (
              <span
                key={index}
                aria-hidden="true"
                className={`absolute inset-x-0 border-t ${
                  index === ticks.length - 1 ? "border-foreground/25" : "border-border"
                }`}
                style={{ top: `${(index / (ticks.length - 1)) * 100}%` }}
              />
            ))}

            <div className="relative flex h-full items-end gap-0.5 sm:gap-1">
              {days.map((day) => {
                const isSelected = selected?.date === day.date;
                const height = max > 0 ? (day.total / max) * 100 : 0;
                return (
                  <button
                    key={day.date}
                    type="button"
                    onFocus={() => setPicked(day.date)}
                    aria-label={`${day.heading}, ${day.value}`}
                    aria-current={day.date === today ? "date" : undefined}
                    className={`flex h-full min-w-0 flex-1 items-end justify-center rounded-t outline-offset-2 transition-colors ${
                      isSelected ? "bg-muted" : ""
                    }`}
                  >
                    {day.isFuture ? (
                      // A day still to come has no bar, not a zero-high one: a
                      // small dash holds its place without claiming a value.
                      <span className="block h-0.5 w-1/2 rounded-full bg-foreground/15" />
                    ) : day.total > 0 ? (
                      <span
                        className={`block w-full max-w-10 rounded-t-[4px] ${
                          isSelected || day.date === today
                            ? "bg-accent"
                            : "bg-accent/70"
                        }`}
                        style={{ height: `${height}%`, minHeight: "2px" }}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-0.5 sm:gap-1" aria-hidden="true">
            {days.map((day) => (
              <span
                key={day.date}
                className={`h-3 min-w-0 flex-1 whitespace-nowrap text-center text-[0.7rem] leading-none ${
                  day.date === today ? "font-semibold text-foreground" : "text-foreground/55"
                }`}
              >
                {/* A zero-width box at the centre of the column, with the text
                    pulled back by half its own width: a two-digit day in an
                    8 px column would otherwise be cut off or push its
                    neighbours aside. */}
                <span className="inline-block w-0 overflow-visible">
                  <span className="inline-block -translate-x-1/2">{day.tick}</span>
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
