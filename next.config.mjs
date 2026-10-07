/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hosted sites need to control trailing slashes themselves (/site -> /site/)
  skipTrailingSlashRedirect: true,
  poweredByHeader: false,
  // Kept as real node_modules so the isolated function processes can load them.
  serverExternalPackages: ["pg", "@neondatabase/serverless", "ws"],
  outputFileTracingIncludes: {
    "/[slug]/[[...path]]": [
      "./node_modules/@neondatabase/serverless/**/*",
      "./node_modules/pg/**/*",
      "./node_modules/ws/**/*",
    ],
  },
};
export default nextConfig;
