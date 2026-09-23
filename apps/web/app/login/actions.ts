"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase-server";

export type AuthState = { error?: string; info?: string };

const Credentials = z.object({
  email: z.string().trim().email("correo inválido"),
  password: z.string().min(6, "la contraseña debe tener al menos 6 caracteres"),
});

function parse(formData: FormData) {
  return Credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
}

async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(" · ") };

  const supabase = await getSupabase();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") return { error: "Confirma tu correo antes de iniciar sesión." };
    if (error.code === "invalid_credentials") return { error: "Correo o contraseña incorrectos." };
    return { error: error.message };
  }
  redirect("/dashboard");
}

async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(" · ") };

  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) {
    if (error.code === "user_already_exists") return { error: "Ese correo ya está registrado." };
    if (error.code === "weak_password") return { error: "Contraseña demasiado débil." };
    return { error: error.message };
  }
  // Con "Confirm email" activo Supabase no devuelve error si el correo ya
  // existe: devuelve un usuario sin identidades.
  if (data.user && data.user.identities?.length === 0) return { error: "Ese correo ya está registrado." };
  // Sin sesión = el proyecto exige confirmar el correo antes de entrar.
  if (!data.session) return { info: "Cuenta creada. Revisa tu correo y confirma el enlace para iniciar sesión." };
  redirect("/dashboard");
}

/** Acción única del formulario: el modo viaja en el campo oculto `mode`. */
export async function authAction(prev: AuthState, formData: FormData): Promise<AuthState> {
  return formData.get("mode") === "signup" ? signUp(prev, formData) : signIn(prev, formData);
}

export async function signOutAction() {
  const supabase = await getSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
