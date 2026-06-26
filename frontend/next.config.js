/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Route API calls to the NestJS backend in dev without leaking the
  // session cookie through CORS preflight.
  async rewrites() {
    const api = process.env.BACKEND_URL ?? 'http://localhost:4000';
    return [
      { source: '/api/:path*', destination: `${api}/:path*` },
    ];
  },
};

module.exports = nextConfig;
