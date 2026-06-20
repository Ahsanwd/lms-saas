/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    'react-markdown', 'remark-gfm', 'remark-parse', 'remark-rehype',
    'unified', 'bail', 'is-plain-obj', 'trough',
    'vfile', 'vfile-message',
    'unist-util-visit', 'unist-util-is', 'unist-util-stringify-position',
    'mdast-util-from-markdown', 'mdast-util-to-hast',
    'mdast-util-gfm', 'mdast-util-gfm-autolink-literal', 'mdast-util-gfm-footnote',
    'mdast-util-gfm-strikethrough', 'mdast-util-gfm-table', 'mdast-util-gfm-task-list-item',
    'micromark', 'micromark-util-combine-extensions', 'micromark-extension-gfm',
    'hast-util-to-jsx-runtime', 'hast-util-whitespace',
    'property-information', 'space-separated-tokens', 'comma-separated-tokens',
    'decode-named-character-reference', 'ccount', 'markdown-table',
    'zwitch', 'longest-streak', 'devlop',
  ],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    domains: ['localhost'],
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http',  hostname: 'localhost' },
    ],
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
