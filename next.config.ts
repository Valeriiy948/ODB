import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Збільшуємо ліміт для завантаження довідок (PDF/DOCX до 50 МБ)
  experimental: {
    serverActions: {
      bodySizeLimit: '52mb',
    },
  },
  // pdf-parse читає тестовий файл із локального шляху — виключаємо
  webpack: (config, { isServer }) => {
    if (isServer) {
      // pdf-parse намагається require('./test/...') — уникаємо bundling
      config.externals = [...(config.externals ?? []), 'pdf-parse']
    }
    return config
  },
}

export default nextConfig
