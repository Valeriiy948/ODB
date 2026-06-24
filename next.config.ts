import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '52mb',
    },
  },
  // pdf-parse needs Node.js filesystem — must run as external package in serverless
  serverExternalPackages: ['pdf-parse'],
  turbopack: {},
}

export default nextConfig
