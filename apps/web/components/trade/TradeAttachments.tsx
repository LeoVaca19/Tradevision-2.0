"use client";

import { useRef, useState } from "react";
import type { TradeAttachment } from "@/lib/data";
import type { TradeBook } from "@/lib/trade-view";
import { createAttachmentAction, deleteAttachmentAction } from "@/app/trades/actions";
import { imageUrl, uploadImage } from "@/lib/upload-image";

async function readSize(file: File): Promise<{ width?: number; height?: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return {};
  }
}

function Thumb({ attachment }: { attachment: TradeAttachment }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="tv-attach-note">No se pudo cargar la imagen</div>;
  return (
    <a href={imageUrl(attachment.key)} target="_blank" rel="noopener noreferrer" aria-label="Abrir la captura completa">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl(attachment.thumbKey ?? attachment.key)}
        alt="Captura de la operación"
        onError={() => setFailed(true)}
      />
    </a>
  );
}

/**
 * Capturas de la operación (hasta `max`). Flujo: se sube el fichero al storage
 * (`uploadImage`) y recién entonces se registra la `key` con
 * `createAttachmentAction`. El límite y la propiedad los fuerza el servidor;
 * acá sólo se evita ofrecer lo que sabemos que va a rechazar.
 */
export function TradeAttachments({
  book,
  tradeId,
  initial,
  max,
}: {
  book: TradeBook;
  tradeId: string;
  initial: TradeAttachment[];
  max: number;
}) {
  const [items, setItems] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const full = items.length >= max;

  async function onPick(files: FileList | null) {
    const picked = Array.from(files ?? []);
    if (picked.length === 0) return;
    const accepted = picked.slice(0, max - items.length);

    setError(null);
    setUploading(true);
    try {
      for (const file of accepted) {
        const key = await uploadImage(file);
        const res = await createAttachmentAction({
          book,
          tradeId,
          key,
          mime: file.type,
          size: file.size,
          ...(await readSize(file)),
        });
        if (!res.ok) throw new Error(res.error);
        setItems((prev) => [...prev, res.attachment]);
      }
      if (picked.length > accepted.length) {
        const uploaded = accepted.length === 1 ? "se subió sólo la primera" : `se subieron las primeras ${accepted.length}`;
        setError(`Sólo entran ${max} capturas por operación: ${accepted.length === 0 ? "no se subió ninguna" : uploaded}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la captura.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(attachment: TradeAttachment) {
    if (!window.confirm("¿Quitar esta captura de la operación?")) return;
    setError(null);
    setDeletingId(attachment.id);
    try {
      const res = await deleteAttachmentAction({ id: attachment.id, book, tradeId });
      if (res.ok) setItems((prev) => prev.filter((a) => a.id !== attachment.id));
      else setError(res.error);
    } catch {
      setError("No se pudo quitar la captura. Reintentá.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="tv-attach">
      <p className="tv-sample" style={{ marginTop: 0 }}>
        {items.length} de {max} · PNG, JPEG o WebP · máx. 10 MB por imagen.
      </p>

      <ul className="tv-attach-grid">
        {items.map((a) => (
          <li key={a.id} className="tv-attach-thumb">
            <Thumb attachment={a} />
            <button
              type="button"
              className="tv-attach-remove"
              aria-label="Quitar captura"
              disabled={deletingId === a.id}
              onClick={() => void remove(a)}
            >
              ✕
            </button>
          </li>
        ))}
        {uploading ? (
          <li className="tv-attach-thumb" aria-busy="true">
            <div className="tv-attach-note">Subiendo…</div>
          </li>
        ) : null}
        {!full && !uploading ? (
          <li>
            <button type="button" className="tv-attach-add" onClick={() => inputRef.current?.click()}>
              + Añadir captura
            </button>
          </li>
        ) : null}
      </ul>

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept="image/png,image/jpeg,image/webp"
        aria-label="Elegir capturas"
        onChange={(e) => void onPick(e.target.files)}
      />

      {error ? (
        <p className="tv-form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
