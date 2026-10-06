"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

type TurnstileApi = {
  render: (box: HTMLElement, params: Record<string, string>) => string;
  remove: (id: string) => void;
  reset: () => void;
};

const api = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

// The widget's container. On the first page load the script, once loaded,
// finds it by class and draws the widget itself (implicit rendering). It scans
// only once: a container mounted later — /login after a refused attempt, whose
// redirect remounts the page, or any client-side navigation to a form — would
// stay empty, so the widget is drawn here when the script is already there.
//
// A token is redeemed once, so after a submission that keeps the same
// container (/join answers in place) the widget is reset for a fresh one.
export function TurnstileBox(props: { sitekey: string; action: string; language: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { pending } = useFormStatus();
  const submitted = useRef(false);

  useEffect(() => {
    const box = ref.current;
    const turnstile = api();
    if (!box || !turnstile || box.childElementCount > 0) return;
    const id = turnstile.render(box, { ...props, theme: "auto" });
    return () => turnstile.remove(id);
    // Drawn once per mount; the props never change for a mounted form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pending) {
      submitted.current = true;
    } else if (submitted.current) {
      submitted.current = false;
      api()?.reset();
    }
  }, [pending]);

  return (
    <div
      ref={ref}
      className="cf-turnstile"
      data-sitekey={props.sitekey}
      data-action={props.action}
      data-language={props.language}
      // Follows the system preference. It cannot follow this app's manual
      // toggle: the widget is drawn inside a Cloudflare iframe, which our
      // stylesheet and our `data-theme` attribute do not reach.
      data-theme="auto"
    />
  );
}
