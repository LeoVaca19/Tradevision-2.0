import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildAttachmentKey,
  presignR2Download,
  presignR2Upload,
  readR2Config,
  validateUpload,
  type PresignedDownload,
  type PresignedUpload,
} from "./r2.js";

/**
 * Almacenamiento de capturas de gráfico (Tech Spec §6.3).
 *
 * Proveedor elegido por entorno, en este orden:
 *   1. Supabase Storage  — si hay `SUPABASE_SERVICE_ROLE_KEY` (usa la misma
 *      Supabase que la BD; sin cuenta ni tarjeta nuevas).
 *   2. Cloudflare R2      — si hay `R2_ACCOUNT_ID` + claves.
 *   3. ninguno            — `POST`/`GET /api/uploads` devuelven 503.
 *
 * En ambos casos la subida es cliente → storage con URL firmada; la lectura es
 * un GET firmado temporal (nunca URL pública sin firmar).
 */

const SIGNED_UPLOAD_TTL = 600;
const SIGNED_DOWNLOAD_TTL = 600;

// ──────────────────────────  Config Supabase Storage  ──────────────────────────

export interface SupabaseStorageConfig {
  url: string;
  serviceRoleKey: string;
  bucket: string;
}

/** Deriva `https://<ref>.supabase.co` del `DATABASE_URL` de Supabase si hace falta. */
function deriveSupabaseUrl(env: NodeJS.ProcessEnv): string | undefined {
  if (env.SUPABASE_URL) return env.SUPABASE_URL;
  const ref =
    env.SUPABASE_PROJECT_REF ??
    env.DATABASE_URL?.match(/db\.([a-z0-9]+)\.supabase\.co/)?.[1] ??
    env.DATABASE_URL?.match(/postgres\.([a-z0-9]+):/)?.[1];
  return ref ? `https://${ref}.supabase.co` : undefined;
}

export function readSupabaseStorageConfig(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseStorageConfig | null {
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const url = deriveSupabaseUrl(env);
  if (!serviceRoleKey || !url) return null;
  return {
    url,
    serviceRoleKey,
    bucket: env.SUPABASE_STORAGE_BUCKET ?? "trade-attachments",
  };
}

function supabaseAdmin(cfg: SupabaseStorageConfig): SupabaseClient {
  return createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Crea el bucket privado si no existe (para un script de setup). */
export async function ensureStorageBucket(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ provider: "supabase"; bucket: string } | { provider: "none" }> {
  const cfg = readSupabaseStorageConfig(env);
  if (!cfg) return { provider: "none" };
  const admin = supabaseAdmin(cfg);
  const { data } = await admin.storage.getBucket(cfg.bucket);
  if (!data) {
    const { error } = await admin.storage.createBucket(cfg.bucket, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
    });
    if (error) throw error;
  }
  return { provider: "supabase", bucket: cfg.bucket };
}

// ───────────────────────────  API pública (la usan las rutas)  ───────────────────────────

export type StorageProvider = "supabase" | "r2" | "none";

export function activeStorageProvider(env: NodeJS.ProcessEnv = process.env): StorageProvider {
  if (readSupabaseStorageConfig(env)) return "supabase";
  if (readR2Config(env)) return "r2";
  return "none";
}

const NOT_CONFIGURED =
  "Almacenamiento no configurado (SUPABASE_SERVICE_ROLE_KEY o R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / …).";

export async function presignAttachmentUpload(input: {
  userId: string;
  mime: string;
  size: number;
}): Promise<PresignedUpload> {
  const v = validateUpload({ mime: input.mime, size: input.size });
  if (!v.ok || !v.ext) throw new Error(v.error ?? "validación fallida");
  const key = buildAttachmentKey(input.userId, v.ext);

  const supa = readSupabaseStorageConfig();
  if (supa) {
    const admin = supabaseAdmin(supa);
    let res = await admin.storage.from(supa.bucket).createSignedUploadUrl(key);
    if (res.error) {
      // bucket aún no creado → lo creamos (privado) y reintentamos una vez.
      await ensureStorageBucket();
      res = await admin.storage.from(supa.bucket).createSignedUploadUrl(key);
    }
    if (res.error || !res.data) {
      throw res.error ?? new Error("no se pudo firmar la subida (Supabase)");
    }
    return { key, uploadUrl: res.data.signedUrl, expiresInSeconds: SIGNED_UPLOAD_TTL };
  }

  const r2 = readR2Config();
  if (r2) return presignR2Upload(key, input.mime, r2);

  throw new Error(NOT_CONFIGURED);
}

export async function presignAttachmentDownload(input: {
  key: string;
  expiresInSeconds?: number;
}): Promise<PresignedDownload> {
  const ttl = input.expiresInSeconds ?? SIGNED_DOWNLOAD_TTL;

  const supa = readSupabaseStorageConfig();
  if (supa) {
    const admin = supabaseAdmin(supa);
    const { data, error } = await admin.storage
      .from(supa.bucket)
      .createSignedUrl(input.key, ttl);
    if (error || !data) throw error ?? new Error("no se pudo firmar la lectura (Supabase)");
    return { url: data.signedUrl, expiresInSeconds: ttl };
  }

  const r2 = readR2Config();
  if (r2) return presignR2Download(input.key, r2, ttl);

  throw new Error(NOT_CONFIGURED);
}
