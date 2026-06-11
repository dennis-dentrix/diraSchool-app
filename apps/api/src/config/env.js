/**
 * Environment variable validation.
 * The process exits immediately with a clear error if a required variable is missing.
 * This prevents the server starting in a broken state with missing secrets.
 */

// These MUST be set in the deployment environment — no fallbacks allowed.
const required = [
  'MONGO_URI',
  'JWT_SECRET',
  'CLIENT_URL',
  'REDIS_URL',
  // SMS provider credentials are optional until the SMS feature is activated
];

const writeStderr = (message) => {
  process.stderr.write(`${message}\n`);
};

export const validateEnv = () => {
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    // USED THIS INSTEAD OF CONSOLE.ERROR DUE TO A WARNING FROM ESLINT
    writeStderr(`\n[ENV ERROR] Missing required environment variables:\n  ${missing.join('\n  ')}`);
    writeStderr('\nCopy .env.example to .env and fill in all required values.\n');
    process.exit(1);
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    writeStderr('\n[ENV ERROR] JWT_SECRET must be at least 32 characters.\n');
    process.exit(1);
  }

  // ZEPTOMAIL_API_KEY is optional — Resend is the active provider.
  // Re-enable this check once ZeptoMail credits are topped up.
  // if (!process.env.ZEPTOMAIL_API_KEY) {
  //   writeStderr('\n[ENV ERROR] ZEPTOMAIL_API_KEY is required.\n');
  //   process.exit(1);
  // }

  if (!process.env.RESEND_API_KEY) {
    writeStderr('\n[ENV ERROR] RESEND_API_KEY is required.\n');
    process.exit(1);
  }

  if (
    process.env.NODE_ENV === 'production' &&
    process.env.CLIENT_URL &&
    process.env.CLIENT_URL.includes('localhost')
  ) {
    writeStderr(
      '\n[ENV WARNING] CLIENT_URL contains "localhost" in production — email links will point to localhost!\n' +
        `  Current value: ${process.env.CLIENT_URL}\n` +
        '  Set CLIENT_URL=https://diraschool.com in your .env file.\n'
    );
    // Non-fatal — warn but don't exit, so the server can still start
  }

  // Africa's Talking — sandbox guard (production only)
  if (
    process.env.NODE_ENV === 'production' &&
    (process.env.SMS_TEST_NUMBERS || process.env.AT_TEST_NUMBERS)
  ) {
    writeStderr(
      '\n[ENV ERROR] SMS_TEST_NUMBERS / AT_TEST_NUMBERS must not be set in production.\n' +
        'It redirects every SMS, including broadcasts, to the test phone numbers.\n'
    );
    process.exit(1);
  }

  if (
    process.env.NODE_ENV === 'production' &&
    String(process.env.AT_USERNAME ?? '').toLowerCase() === 'sandbox'
  ) {
    writeStderr(
      '\n[ENV ERROR] AT_USERNAME must be your live Africa\'s Talking username in production — not "sandbox".\n'
    );
    process.exit(1);
  }

  const productionSenderId = process.env.AT_SENDER_ID;
  if (
    process.env.NODE_ENV === 'production' &&
    String(productionSenderId ?? '').toLowerCase() === 'sandbox'
  ) {
    writeStderr(
      '\n[ENV ERROR] AT_SENDER_ID cannot be "sandbox" in production. Use an approved sender ID or leave it blank.\n'
    );
    process.exit(1);
  }

  // Cloudflare R2 — partial config is always a mistake
  const r2Vars = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_ENDPOINT'];
  const configuredR2Vars = r2Vars.filter((key) => !!process.env[key]);
  if (configuredR2Vars.length > 0 && configuredR2Vars.length < r2Vars.length) {
    writeStderr(
      '\n[ENV ERROR] Partial Cloudflare R2 configuration detected.\n' +
        'Set all 4 variables or none:\n' +
        '  R2_ACCESS_KEY_ID\n' +
        '  R2_SECRET_ACCESS_KEY\n' +
        '  R2_BUCKET\n' +
        '  R2_ENDPOINT\n'
    );
    process.exit(1);
  }

  if (process.env.PAYSTACK_ENABLED === 'true' && !process.env.PAYSTACK_SECRET_KEY) {
    writeStderr('\n[ENV ERROR] PAYSTACK_ENABLED is true but PAYSTACK_SECRET_KEY is not set.\n');
    process.exit(1);
  }
};

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  // No fallback — must be set explicitly in every environment
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '20h',
  CLIENT_URL: process.env.CLIENT_URL,
  CLIENT_URL_STAGING: process.env.CLIENT_URL_STAGING,
  REDIS_URL: process.env.REDIS_URL,
  // Africa's Talking SMS — set AT_USERNAME + AT_API_KEY to enable SMS
  AT_USERNAME: process.env.AT_USERNAME || null,
  AT_API_KEY: process.env.AT_API_KEY || null,
  // Approved AT sender ID / shortcode (e.g. "DIRASCHOOL"). Leave blank to use AT shared shortcode.
  AT_SENDER_ID: process.env.AT_SENDER_ID || null,
  // Comma-separated E.164 numbers. When set, ALL SMS are redirected to these — dev/QA only.
  SMS_TEST_NUMBERS:
    process.env.SMS_TEST_NUMBERS || process.env.AT_TEST_NUMBERS
      ? (process.env.SMS_TEST_NUMBERS || process.env.AT_TEST_NUMBERS)
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean)
      : null,
  EMAIL_FROM: process.env.EMAIL_FROM,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  ZEPTOMAIL_API_KEY: process.env.ZEPTOMAIL_API_KEY,
  ZEPTOMAIL_API_URL: process.env.ZEPTOMAIL_API_URL || 'api.zeptomail.com/',
  // Cloudflare R2 — set all 4 to enable file uploads
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET: process.env.R2_BUCKET,
  R2_ENDPOINT: process.env.R2_ENDPOINT, // e.g. https://<account_id>.r2.cloudflarestorage.com
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || null, // custom domain or R2.dev URL for serving files
  // Monitoring — optional
  SENTRY_DSN: process.env.SENTRY_DSN,
  // Paystack — optional. Set PAYSTACK_ENABLED=true to activate checkout endpoints.
  PAYSTACK_ENABLED: process.env.PAYSTACK_ENABLED === 'true',
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
  // Safaricom Daraja C2B — optional until a school connects M-Pesa.
  MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY,
  MPESA_CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET,
  MPESA_PASSKEY: process.env.MPESA_PASSKEY,
  MPESA_SHORTCODE: process.env.MPESA_SHORTCODE,
  MPESA_ENV: process.env.MPESA_ENV || 'production',
  MPESA_BASE_URL:
    process.env.MPESA_BASE_URL ||
    (process.env.MPESA_ENV === 'sandbox'
      ? 'https://sandbox.safaricom.co.ke'
      : 'https://api.safaricom.co.ke'),
  MPESA_CALLBACK_BASE_URL: process.env.MPESA_CALLBACK_BASE_URL,
  MPESA_IP_WHITELIST_ENABLED: process.env.MPESA_IP_WHITELIST_ENABLED,
  MPESA_ALLOWED_IPS: process.env.MPESA_ALLOWED_IPS
    ? process.env.MPESA_ALLOWED_IPS.split(',')
        .map((ip) => ip.trim())
        .filter(Boolean)
    : [],
  // Google OAuth — set GOOGLE_CLIENT_ID to enable "Sign in with Google"
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || null,
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',
};
