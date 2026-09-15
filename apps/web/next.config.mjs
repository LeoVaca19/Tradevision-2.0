/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Igual que en tradevision/: sólo transpilar los paquetes de UI/lógica pura.
  // `db` e `integrations` se consumen desde su `dist/` compilado para mantener
  // sus dependencias con código nativo/Node fuera del bundler del servidor.
  transpilePackages: ["@tradevision/contracts", "@tradevision/engine", "@tradevision/design-system"],
};

export default nextConfig;
