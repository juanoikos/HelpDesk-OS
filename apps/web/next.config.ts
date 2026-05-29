import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@helpdesk-os/ui", "@helpdesk-os/types", "@helpdesk-os/db"],
};

export default nextConfig;
