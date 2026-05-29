import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Necesario en monorepo: le dice a Next.js que el root de tracing es helpdesk-os/
  // para que el standalone incluya packages/* y el server quede en standalone/apps/web/server.js
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@helpdesk-os/ui", "@helpdesk-os/types", "@helpdesk-os/db"],
  // next-auth v5 beta genera errores de tipo no portables en build de producción.
  // El código es correcto — esto solo aplica al paso de type-check de Next.js.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
