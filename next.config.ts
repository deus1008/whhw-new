import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['unpdf', 'xlsx'],
  async rewrites() {
    return [
      { source: '/수수료율', destination: '/commission-rate' },
      { source: '/수수료율/:path*', destination: '/commission-rate/:path*' },
    ];
  },
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
