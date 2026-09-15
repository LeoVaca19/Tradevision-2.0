import { currentUser } from "@/lib/data";
import type { DemoUser } from "@/lib/demo-store";

/**
 * STUB DE AUTENTICACIÓN — sin auth real todavía (decidido en el Bloque 1 de la
 * migración: Clerk vs Supabase Auth queda para cuando haya usuarios reales).
 * Hoy la identidad la resuelve `lib/data` (usuario de la BD si hay
 * `DATABASE_URL`, o el usuario de la demo en memoria si no).
 */

export type CurrentUser = DemoUser;

export const getCurrentUser = currentUser;
