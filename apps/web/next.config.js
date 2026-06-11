/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
  },
  async rewrites() {
    return [];
  },
};

module.exports = nextConfig;
