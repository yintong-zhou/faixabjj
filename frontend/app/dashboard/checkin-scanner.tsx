"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";

import { QrCodeIcon } from "@/components/icons";
import { checkinPathFromQr } from "@/utils/checkin-qr";

export type CheckinScannerLabels = {
  open: string;
  title: string;
  help: string;
  starting: string;
  wrongQr: string;
  retry: string;
  close: string;
  failure: Record<CameraFailure, string>;
};

export type CameraFailure = "denied" | "unavailable" | "unsupported";

// Why getUserMedia() refused, reduced to what the member can act on. The raw
// error never reaches the screen.
function cameraFailure(error: unknown): CameraFailure {
  const name = error instanceof DOMException ? error.name : "";
  return name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable";
}

// A frame is shrunk to this width before decoding: the cost of reading a code
// grows with the pixel count, and a QR held at arm's length is still far more
// than 640 px of detail.
const SCAN_WIDTH = 640;
const SCAN_EVERY_MS = 120;

// The "Scansiona QR" button of the personal dashboard and the camera it opens.
//
// It reads the gym's QR (which holds the /check-in address) and goes to
// /check-in, which does the rest exactly as when the phone's own camera opens
// the link: the same lessons, the same window, the same position check. The
// scanner decides nothing about attendance.
//
// The camera frames are decoded here, on the device. They are not sent or
// stored anywhere, and the stream stops the moment the dialog closes.
export function CheckinScanner({ labels }: { labels: CheckinScannerLabels }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const frame = useRef(0);
  // Bumped by every start and every stop. An async step that wakes up to find
  // it changed knows it was overtaken — the dialog was closed while the browser
  // was still asking for permission — and must not touch the camera again.
  const run = useRef(0);

  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<CameraFailure | null>(null);
  const [wrongQr, setWrongQr] = useState(false);

  const stop = useCallback(() => {
    run.current += 1;
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  // The page can be left (the scan navigates away) with the camera running.
  useEffect(() => stop, [stop]);

  function scan(token: number) {
    let last = 0;

    const tick = (time: number) => {
      if (token !== run.current) return;
      frame.current = requestAnimationFrame(tick);
      if (time - last < SCAN_EVERY_MS) return;
      last = time;

      const source = video.current;
      if (!source || source.readyState < 2 || !source.videoWidth) return;

      const scale = Math.min(1, SCAN_WIDTH / source.videoWidth);
      const width = Math.round(source.videoWidth * scale);
      const height = Math.round(source.videoHeight * scale);

      const surface = (canvas.current ??= document.createElement("canvas"));
      if (surface.width !== width) surface.width = width;
      if (surface.height !== height) surface.height = height;
      const context = surface.getContext("2d", { willReadFrequently: true });
      if (!context) return;

      context.drawImage(source, 0, 0, width, height);
      const image = context.getImageData(0, 0, width, height);
      // Both polarities: a printed code is dark on light, one shown on a phone
      // in dark mode is the other way round.
      const code = jsQR(image.data, width, height, { inversionAttempts: "attemptBoth" });
      if (!code) return;

      const path = checkinPathFromQr(code.data);
      if (!path) {
        setWrongQr(true);
        return;
      }

      stop();
      dialog.current?.close();
      router.push(path);
    };

    frame.current = requestAnimationFrame(tick);
  }

  async function start() {
    stop();
    const token = run.current;
    setFailure(null);
    setWrongQr(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      // No camera API: an insecure (plain http) page, or an old browser.
      setFailure("unsupported");
      return;
    }

    setStarting(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (token !== run.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }

      stream.current = media;
      const element = video.current;
      if (!element) return;
      element.srcObject = media;
      await element.play();
      if (token !== run.current) return;

      setStarting(false);
      scan(token);
    } catch (error) {
      if (token !== run.current) return;
      setStarting(false);
      setFailure(cameraFailure(error));
    }
  }

  function open() {
    dialog.current?.showModal();
    void start();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 sm:w-fit"
      >
        <QrCodeIcon className="h-5 w-5 shrink-0" />
        {labels.open}
      </button>

      {/* No padding on the dialog itself: a click on the backdrop lands on the
          dialog element, and padding would make a tap just inside the card
          count as one. */}
      <dialog
        ref={dialog}
        aria-label={labels.title}
        onClose={stop}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-border bg-background p-0 text-foreground backdrop:bg-black/60"
      >
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-base font-semibold">{labels.title}</h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted"
            >
              {labels.close}
            </button>
          </div>

          {/* Black whatever the theme: it is a camera view, not a surface. */}
          <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
            <video
              ref={video}
              muted
              playsInline
              className="h-full w-full object-cover"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-[15%] rounded-2xl border-2 border-white/80"
            />
          </div>

          {starting ? (
            <p role="status" className="text-sm text-foreground/65">
              {labels.starting}
            </p>
          ) : null}

          {wrongQr ? (
            <p role="status" className="text-sm text-accent">
              {labels.wrongQr}
            </p>
          ) : null}

          {failure ? (
            <div className="flex flex-col items-start gap-2">
              <p role="alert" className="text-sm text-accent">
                {labels.failure[failure]}
              </p>
              {failure !== "unsupported" ? (
                <button
                  type="button"
                  onClick={() => void start()}
                  className="rounded-full border border-border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                  {labels.retry}
                </button>
              ) : null}
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-foreground/55">{labels.help}</p>
          )}
        </div>
      </dialog>
    </>
  );
}
