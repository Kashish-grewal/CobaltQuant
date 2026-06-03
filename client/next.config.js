/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allows the frontend to call the backend API via /api proxy
  // This avoids CORS issues in production and looks cleaner in code
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
