import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The Mongo driver pulls in optional native/dynamic dependencies that a
  // bundler cannot statically resolve; keeping it external leaves it as a real
  // runtime require instead of a build-time warning storm.
  serverExternalPackages: ['mongodb'],

  // The upload endpoint receives multipart bodies up to MAX_UPLOAD_BYTES
  // (10MB). Next's default Server Action body limit is 1MB; the API route is
  // not bound by it, but raising this keeps the two consistent if any part of
  // the flow moves to a Server Action later.
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
};

export default nextConfig;
