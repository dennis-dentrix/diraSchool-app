import { env } from '../config/env.js';

/**
 * Get cookie domain for sharing tokens across web and API subdomains.
 *
 * Production (DigitalOcean): diraschool.com, api.diraschool.com → '.diraschool.com'
 * Production (Render): diraschool.onrender.com, diraschool-api.onrender.com → undefined (no domain)
 * Development: localhost → undefined (no domain)
 *
 * Returns undefined to let the browser use the origin's domain.
 * This ensures cookies work with SameSite=Lax/Strict across same-site requests.
 */
export const getCookieDomain = () => {
  if (!env.isProduction || !env.CLIENT_URL) return undefined;

  try {
    const hostname = new URL(env.CLIENT_URL).hostname;

    // For Render (*.onrender.com), don't set domain — use browser default
    if (hostname.includes('onrender.com')) {
      return undefined;
    }

    // For custom domains (DigitalOcean), extract base domain
    const parts = hostname.split('.');
    return parts.length >= 2 ? `.${parts.slice(-2).join('.')}` : undefined;
  } catch {
    return undefined;
  }
};
