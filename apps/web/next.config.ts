import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@helpdesk-os/ui", "@helpdesk-os/types"],
};

export default nextConfig;
