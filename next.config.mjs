/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hosted sites need to control trailing slashes themselves (/site -> /site/)
  skipTrailingSlashRedirect: true,
  poweredByHeader: false,
  // Kept as real node_modules so the isolated function processes can load them.
  serverExternalPackages: ["pg", "@neondatabase/serverless", "ws", "@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    // the headless Chromium used for project screenshots (its binary is not imported, so it must be traced by hand)
    "/api/projects/[slug]/shot": ["./node_modules/@sparticuz/chromium/**/*"],
    "/[slug]/[[...path]]": [
      "./node_modules/@neondatabase/serverless/**/*",
      "./node_modules/pg/**/*",
      "./node_modules/ws/**/*",
    ],
  },
};
export default nextConfig;
