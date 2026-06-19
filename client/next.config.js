/** @type {import('next').NextConfig} */
const nextConfig = {
  // Catches double-render bugs in development (no effect in production)
  reactStrictMode: true,

  // Produces a self-contained build at .next/standalone for Docker
  output: "standalone",

  // Allows the frontend to call the backend API via /api proxy
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/:path*`,
      },
    ];
  },

  // Reduce bundle size by tree-shaking heavy packages
  experimental: {
    optimizePackageImports: ["d3"],
  },
};

module.exports = nextConfig;
