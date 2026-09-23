"use client";

import { useState } from "react";

const UNSIGNED = /^[0-9]*\.?[0-9]*$/;
const SIGNED = /^-?[0-9]*\.?[0-9]*$/;

/**
 * Número decimal que acepta "12,5" y "12.5" y siempre se muestra con punto.
 * `type="number"` de Chrome bloquea la coma, así que se edita como texto: la
 * coma se convierte en punto, se descartan letras/espacios y se rechaza un
 * segundo separador. Sirve dentro de un <form> (`name`, `required`; el valor
 * enviado ya lleva punto) y como campo controlado (`onChange` recibe el número
 * ya parseado, `null` si no hay ningún dígito). El texto se guarda aparte para
 * no perder el separador mientras se tipea ("12.").
 *
 * `signed` admite un "-" inicial. Usa `inputMode="text"` porque el teclado
 * decimal de iOS no tiene signo menos.
 */
export function DecimalInput({
  name,
  value,
  onChange,
  signed = false,
  required,
  placeholder,
}: {
  name?: string;
  value?: number | null;
  onChange?: (n: number | null) => void;
  signed?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const allowed = signed ? SIGNED : UNSIGNED;

  return (
    <input
      type="text"
      inputMode={signed ? "text" : "decimal"}
      name={name}
      value={text}
      required={required}
      placeholder={placeholder}
      pattern={signed ? "-?[0-9]*\\.?[0-9]+" : "[0-9]*\\.?[0-9]+"}
      title="Número con punto decimal, p. ej. 2.5 (la coma se convierte en punto)"
      onChange={(e) => {
        const next = e.target.value.replace(signed ? /[^0-9.,-]/g : /[^0-9.,]/g, "").replace(/,/g, ".");
        if (!allowed.test(next)) return;
        setText(next);
        const n = Number(next);
        onChange?.(/[0-9]/.test(next) && Number.isFinite(n) ? n : null);
      }}
    />
  );
}
