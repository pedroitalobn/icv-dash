/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Carimbo do momento do build (para conferir a versão em produção).
    BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
