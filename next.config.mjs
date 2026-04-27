/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: '/pdf_sopralluoghi/:path*',
        headers: [
          { key: 'Content-Type', value: 'application/pdf' },
          { key: 'Content-Disposition', value: 'inline' },
        ],
      },
    ];
  },
};
export default nextConfig;
