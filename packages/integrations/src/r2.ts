import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";

/**
 * Almacenamiento de archivos en Cloudflare R2 (S3-compatible) por presigned URL
 * (Tech Spec §6.3). Reglas del MVP:
 *  - mime ∈ {png, jpg/jpeg, webp}
 *  - size ≤ 10 MB
 *  - referencia por `key`, nunca URL pública sin firmar para contenido dentro de
 *    la Ventana de Retardo.
 *  - EXIF se elimina en un paso posterior (worker Inngest / Cloudflare Images).
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export interface UploadValidation {
  ok: boolean;
  error?: string;
  ext?: string;
}

/** Validación PURA — sin I/O. */
export function validateUpload(input: { mime: string; size: number }): UploadValidation {
  const ext = MIME_EXT[input.mime];
  if (!ext) return { ok: false, error: `tipo no permitido: ${input.mime}` };
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, error: "tamaño inválido" };
  }
  if (input.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `supera ${MAX_UPLOAD_BYTES} bytes` };
  }
  return { ok: true, ext };
}

/** Clave determinista-en-forma: `trades/<userId>/<random>.<ext>`. */
export function buildAttachmentKey(userId: string, ext: string): string {
  return `trades/${userId}/${nanoid(21)}.${ext}`;
}

/** Prefijo `trades/<userId>/…` — para comprobar que una `key` pertenece al usuario. */
export function attachmentKeyBelongsTo(key: string, userId: string): boolean {
  return key.startsWith(`trades/${userId}/`) && !key.includes("..");
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export function readR2Config(env = process.env): R2Config | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
  };
}

export function createR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

export interface PresignedDownload {
  url: string;
  expiresInSeconds: number;
}

/**
 * Backend R2 de la subida. Lo elige `storage.ts` cuando hay `R2_*` en el entorno.
 * `key` y validación ya vienen resueltas por el llamador.
 */
export async function presignR2Upload(
  key: string,
  mime: string,
  config: R2Config,
): Promise<PresignedUpload> {
  const client = createR2Client(config);
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: mime }),
    { expiresIn: 600 },
  );
  return { key, uploadUrl, expiresInSeconds: 600 };
}

export async function presignR2Download(
  key: string,
  config: R2Config,
  expiresIn = 600,
): Promise<PresignedDownload> {
  const client = createR2Client(config);
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn },
  );
  return { url, expiresInSeconds: expiresIn };
}
