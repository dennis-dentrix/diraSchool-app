import { env } from './env.js';

export const allowedOrigins = [
  env.CLIENT_URL,
  env.CLIENT_URL_STAGING,
  // Local dev
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  // Production
  'https://diraschool.com',
  'https://www.diraschool.com',
  'https://dira-school-api-web.vercel.app',
  // Staging
  'https://staging.diraschool.com',
  // Temporary: direct IP access before DNS propagation
  'https://159.89.230.170',
  'https://159.89.230.170:443',
].filter(Boolean);

export const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, mobile apps, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`Origin ${origin} not allowed by CORS policy`));
  },
  credentials: true, // Required for HTTP-only cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
