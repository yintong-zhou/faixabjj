import { useEffect, useRef, useState } from "react";

export type CopyState = "idle" | "copied" | "failed";

// Puts `text` on the clipboard. The async API first; where the browser refuses
// it (an iframe, a denied permission) a throwaway textarea and execCommand,
// which need no permission, only the user gesture the caller is already in.
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const previous = document.activeElement as HTMLElement | null;
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    previous?.focus();
    return ok;
  }
}

// The "Copied" / "failed" feedback that fades by itself, shared by every copy
// button so they all behave the same.
export function useCopyFeedback() {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy(text: string): Promise<boolean> {
    const ok = await copyText(text);
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), ok ? 2000 : 4000);
    return ok;
  }

  return { state, copy };
}
