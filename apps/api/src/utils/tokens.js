import crypto from 'crypto';

export const generateToken = () => {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
};

export const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

export const randomPassword = () =>
  crypto.randomBytes(16).toString('hex');
