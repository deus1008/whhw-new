import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['unpdf', 'xlsx'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'nedrug.mfds.go.kr',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
