import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@helpdesk-os/ui", "@helpdesk-os/types", "@helpdesk-os/db"],
};

export default nextConfig;
