import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendError, sendForbidden } from '../../utils/response.js';
import { getSignedFileUrl } from '../../jobs/helpers/r2Upload.js';

// School-scoped folder prefixes that authenticated users may access
function allowedPrefixes(schoolId) {
  const id = String(schoolId);
  return [
    `students/${id}/`,
    `school-branding/${id}/`,
    `lesson-plans/${id}/`,
    `lesson-plans-pdf/${id}/`,
    `report-cards/${id}/`,
    `receipts/${id}/`,
  ];
}

/**
 * GET /api/v1/files/signed-url?key=<objectKey>
 * Returns a 15-minute signed URL for a private R2 object.
 * The key must belong to the requesting user's school.
 */
export const getFileUrl = asyncHandler(async (req, res) => {
  const { key } = req.query;
  if (!key) return sendError(res, 'key query parameter is required.', 400);

  const prefixes = allowedPrefixes(req.user.schoolId);
  if (!prefixes.some((p) => key.startsWith(p))) {
    return sendForbidden(res, 'Access denied.');
  }

  const url = await getSignedFileUrl(key, 900);
  if (!url) return sendError(res, 'File storage is not configured.', 503);

  return sendSuccess(res, { url, expiresIn: 900 });
});
