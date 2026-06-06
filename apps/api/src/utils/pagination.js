/**
 * Consistent pagination across all list endpoints.
 * Default: 20 per page. Max: 1000 per page (for reference data like students).
 * No endpoint ever returns an unbounded list.
 */
export const paginate = (query, total) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(1000, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  const totalPages = Math.ceil(total / limit);

  return {
    skip,
    limit,
    meta: {
      total,
      page,
      limit,
      totalPages,
    },
  };
};
