import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  attachmentKeyBelongsTo,
  buildAttachmentKey,
  validateUpload,
} from "../src/r2.js";
import { activeStorageProvider, presignAttachmentDownload } from "../src/storage.js";

describe("validateUpload (Tech Spec §6.3)", () => {
  it("acepta png / jpeg / webp bajo el límite", () => {
    expect(validateUpload({ mime: "image/png", size: 1024 })).toMatchObject({ ok: true, ext: "png" });
    expect(validateUpload({ mime: "image/jpeg", size: 1024 })).toMatchObject({ ok: true, ext: "jpg" });
    expect(validateUpload({ mime: "image/webp", size: 1024 })).toMatchObject({ ok: true, ext: "webp" });
  });

  it("rechaza tipos no permitidos", () => {
    expect(validateUpload({ mime: "image/gif", size: 10 }).ok).toBe(false);
    expect(validateUpload({ mime: "application/pdf", size: 10 }).ok).toBe(false);
  });

  it("rechaza tamaños inválidos y por encima de 10 MB", () => {
    expect(validateUpload({ mime: "image/png", size: 0 }).ok).toBe(false);
    expect(validateUpload({ mime: "image/png", size: MAX_UPLOAD_BYTES + 1 }).ok).toBe(false);
  });
});

describe("buildAttachmentKey", () => {
  it("namespacea por usuario y respeta la extensión", () => {
    const key = buildAttachmentKey("user-123", "webp");
    expect(key).toMatch(/^trades\/user-123\/[A-Za-z0-9_-]{21}\.webp$/);
  });
});

describe("attachmentKeyBelongsTo", () => {
  it("acepta sólo claves del propio usuario y sin path traversal", () => {
    const key = buildAttachmentKey("u1", "png");
    expect(attachmentKeyBelongsTo(key, "u1")).toBe(true);
    expect(attachmentKeyBelongsTo(key, "u2")).toBe(false);
    expect(attachmentKeyBelongsTo("trades/u1/../u2/x.png", "u1")).toBe(false);
    expect(attachmentKeyBelongsTo("otro/u1/x.png", "u1")).toBe(false);
  });
});

describe("almacenamiento sin configurar", () => {
  const noStorageEnv = { ...process.env };
  delete noStorageEnv.SUPABASE_SERVICE_ROLE_KEY;
  delete noStorageEnv.R2_ACCOUNT_ID;

  it("activeStorageProvider = 'none' cuando falta todo", () => {
    expect(activeStorageProvider(noStorageEnv)).toBe("none");
  });

  it("presignAttachmentDownload lanza si no hay proveedor", async () => {
    await expect(presignAttachmentDownload({ key: "trades/u1/x.png" })).rejects.toThrow(
      /Almacenamiento no configurado/,
    );
  });
});
