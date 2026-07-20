import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: [
    '@nemis-desktop/types',
    '@nemis-desktop/shared',
    '@nemis-desktop/ui',
    '@nemis-desktop/presentation',
    '@nemis-desktop/application',
    '@nemis-desktop/domain',
  ],
};

export default nextConfig;
