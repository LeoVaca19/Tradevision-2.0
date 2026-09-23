"use client";

import { useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Autoguardado con debounce + `flush()` para forzar el guardado pendiente
 * (p. ej. el botón "Listo"). `save` no recibe el valor: quien llama lo lee de
 * una ref/editor al momento de guardar, así siempre se persiste lo último.
 * `flush()` resuelve `true` si no quedó nada sin guardar.
 */
export function useAutosave(save: () => Promise<unknown>, delayMs: number) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);
  const failed = useRef(false);

  function run(): Promise<boolean> {
    setStatus("saving");
    const p = save().then(
      () => {
        failed.current = false;
        setStatus("saved");
        return true;
      },
      () => {
        failed.current = true;
        setStatus("error");
        return false;
      },
    );
    inflight.current = p;
    return p;
  }

  function schedule() {
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    timer.current = setTimeout(() => {
      timer.current = null;
      void run();
    }, delayMs);
  }

  async function flush(): Promise<boolean> {
    const hadPending = timer.current !== null;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inflight.current) await inflight.current;
    return hadPending || failed.current ? run() : true;
  }

  return { status, schedule, flush };
}
