/**
 * Normalise Kenyan phone numbers to E.164 format (+254XXXXXXXXX).
 * Accepts: 07XXXXXXXX, 7XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX
 */
export const normalisePhone = (phone) => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');

  if (digits.startsWith('254') && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.startsWith('0') && digits.length === 10) {
    return `+254${digits.slice(1)}`;
  }
  if ((digits.length === 9 && digits.startsWith('7')) || digits.startsWith('1')) {
    return `+254${digits}`;
  }

  // Return as-is if we can't normalise — let Zod validation catch it
  return phone;
};
