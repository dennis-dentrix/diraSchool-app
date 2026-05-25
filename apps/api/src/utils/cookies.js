import { env } from '../config/env.js';

// Returns '.diraschool.com' in production so the cookie is shared across
// www.diraschool.com (Next.js) and api.diraschool.com (this API).
// Returns undefined in development (localhost cookies don't need a domain).
export const getCookieDomain = () => {
  if (!env.isProduction || !env.CLIENT_URL) return undefined;
  try {
    const hostname = new URL(env.CLIENT_URL).hostname;
    const parts = hostname.split('.');
    return parts.length >= 2 ? `.${parts.slice(-2).join('.')}` : undefined;
  } catch {
    return undefined;
  }
};
