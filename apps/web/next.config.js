/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    domains: ['localhost'],
  },
  async rewrites() {
    return [];
  },
  webpack: (config) => {
    // pdfjs-dist uses .mjs modules — tell webpack to handle them
    config.resolve.alias['pdfjs-dist'] = 'pdfjs-dist/build/pdf.min.mjs';
    return config;
  },
};

module.exports = nextConfig;
