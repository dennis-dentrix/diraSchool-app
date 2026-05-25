// Returns a case-insensitive RegExp with special characters escaped.
export const searchRegex = (value) =>
  new RegExp(String(value).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
