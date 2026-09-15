import { NextResponse } from "next/server";
import { attachmentKeyBelongsTo, presignAttachmentDownload } from "@tradevision/integrations";
import { getCurrentUser } from "@/lib/auth";

/**
 * Sirve una captura subida al storage (Tech Spec §6.3). El editor guarda la
 * imagen como `/api/uploads/<key>` dentro del JSON del diario; aquí se firma
 * un GET temporal y se redirige. La `key` nunca se expone como URL pública
 * sin firmar.
 *
 * `POST /api/uploads` (firmar la SUBIDA) vive en `../route.ts` y no cambia.
 */

export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ key: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "no autenticado" }, { status: 401 });
  }

  const { key: raw } = await ctx.params;
  let key = raw;
  try {
    key = decodeURIComponent(raw);
  } catch {
    /* raw ya venía decodificado */
  }

  if (!attachmentKeyBelongsTo(key, user.id)) {
    return NextResponse.json({ error: "no autorizado para esta imagen" }, { status: 403 });
  }

  try {
    const { url } = await presignAttachmentDownload({ key });
    return NextResponse.redirect(url, 307);
  } catch (err) {
    // Storage sin configurar en local: la imagen no se sirve, pero no rompe la página.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "no se pudo servir la imagen" },
      { status: 503 },
    );
  }
}
