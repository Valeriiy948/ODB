import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Збільшуємо ліміт для завантаження довідок (PDF/DOCX до 50 МБ)
  experimental: {
    serverActions: {
      bodySizeLimit: '52mb',
    },
  },
  // Turbopack — дефолт у Next.js 16 (webpack не потрібен)
  turbopack: {},
}

export default nextConfig
