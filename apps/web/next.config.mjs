/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Igual que en tradevision/: sólo transpilar los paquetes de UI/lógica pura.
  // `db` e `integrations` se consumen desde su `dist/` compilado para mantener
  // sus dependencias con código nativo/Node fuera del bundler del servidor.
  transpilePackages: ["@tradevision/contracts", "@tradevision/engine", "@tradevision/design-system"],
  // `postgres` (postgres-js) no debe pasar por el bundler del servidor —
  // `lib/data.ts` importa `@tradevision/db` dinámicamente (Bloque 8). Sin
  // `@electric-sql/pglite`: esa rama no se portó (Bloque 5a, decisión de
  // Leonardo — nunca funcionó desde la web en el proyecto anterior).
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
