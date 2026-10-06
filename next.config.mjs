/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hosted sites need to control trailing slashes themselves (/site -> /site/)
  skipTrailingSlashRedirect: true,
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
};
export default nextConfig;
