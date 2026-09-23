import { currentUser, currentUserOrNull } from "@/lib/data";

/**
 * Identidad del usuario actual. Con BD real es la sesión de Supabase Auth
 * (`getSessionUser`); sin `DATABASE_URL` es el usuario demo en memoria.
 * `getCurrentUser` lanza sin sesión; `getCurrentUserOrNull` devuelve `null`.
 */

export const getCurrentUser = currentUser;
export const getCurrentUserOrNull = currentUserOrNull;
