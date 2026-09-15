import { NextResponse } from "next/server";
import { z } from "zod";
import { presignAttachmentUpload, validateUpload } from "@tradevision/integrations";
import { getCurrentUser } from "@/lib/auth";

/**
 * Paso 1 de la subida de imágenes (Tech Spec §6.3): el cliente pide una
 * presigned URL. Validamos `mime` ∈ {png, jpg, webp} y `size` ≤ 10 MB antes de
 * firmar nada. La subida real va cliente → storage directamente.
 */

export const runtime = "nodejs";

const Body = z.object({
  mime: z.string(),
  size: z.number().int().positive(),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "no autenticado" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const check = validateUpload(parsed.data);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 422 });
  }

  try {
    const presigned = await presignAttachmentUpload({
      userId: user.id,
      mime: parsed.data.mime,
      size: parsed.data.size,
    });
    return NextResponse.json(presigned);
  } catch (err) {
    // Storage sin configurar en local: no rompe el registro, sólo desactiva imágenes.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "no se pudo firmar la subida" },
      { status: 503 },
    );
  }
}
