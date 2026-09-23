export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * URL para mostrar una imagen subida. La `key` lleva barras (`trades/<user>/…`)
 * y la ruta `/api/uploads/[key]` es de un solo segmento: hay que codificarla.
 */
export function imageUrl(key: string): string {
  return `/api/uploads/${encodeURIComponent(key)}`;
}

async function errorFrom(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

/**
 * Sube una imagen al storage (POST /api/uploads → PUT a la URL firmada) y
 * devuelve su `key`. NO registra nada en la BD: quien llama decide qué hacer
 * con la key (adjunto de la operación, imagen embebida en el diario…).
 * Lanza `Error` con un mensaje ya listo para mostrar al usuario.
 */
export async function uploadImage(file: File): Promise<string> {
  if (!ACCEPTED_MIME.has(file.type)) throw new Error("Formato no admitido (usá PNG, JPEG o WebP).");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("La imagen supera los 10 MB.");

  const offline = () => new Error("No se pudo conectar para subir la imagen. Reintentá.");

  const presign = await fetch("/api/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mime: file.type, size: file.size }),
  }).catch(() => {
    throw offline();
  });

  if (presign.status === 503) {
    throw new Error("La subida de imágenes todavía no está configurada en este entorno (falta el almacenamiento).");
  }
  if (!presign.ok) throw new Error(await errorFrom(presign, "No se pudo iniciar la subida."));

  const { uploadUrl, key } = (await presign.json()) as { uploadUrl: string; key: string };

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": file.type },
    body: file,
  }).catch(() => {
    throw offline();
  });
  if (!put.ok) throw new Error("La subida de la imagen falló.");

  return key;
}
