import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['unpdf'],
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
