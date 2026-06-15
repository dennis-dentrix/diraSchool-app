import SchoolSettings from './SchoolSettings.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis.js';
import { CACHE_TTL } from '../../constants/index.js';
import { uploadBuffer } from '../../jobs/helpers/r2Upload.js';

const settingsCacheKey = (schoolId) => `settings:${schoolId}`;

/**
 * GET /api/v1/settings
 * Returns this school's settings document, creating a default one if it doesn't exist yet.
 */
export const getSettings = asyncHandler(async (req, res) => {
  const schoolId = req.user.schoolId;
  const cacheKey = settingsCacheKey(schoolId);

  const cached = await cacheGet(cacheKey);
  if (cached) return sendSuccess(res, { settings: cached });

  // upsert — first call initialises with defaults
  const settings = await SchoolSettings.findOneAndUpdate(
    { schoolId },
    { $setOnInsert: { schoolId } },
    { upsert: true, new: true }
  );

  await cacheSet(cacheKey, settings, CACHE_TTL.SCHOOL_SETTINGS);
  return sendSuccess(res, { settings });
});

/**
 * PUT /api/v1/settings
 * Replaces top-level fields (terms array, workingDays, currentAcademicYear, etc.).
 * Holidays are managed separately via POST/DELETE /settings/holidays.
 */
export const updateSettings = asyncHandler(async (req, res) => {
  const schoolId = req.user.schoolId;

  const settings = await SchoolSettings.findOneAndUpdate(
    { schoolId },
    { $set: req.body },
    { upsert: true, new: true, runValidators: true }
  );

  await cacheDel(settingsCacheKey(schoolId));
  return sendSuccess(res, { settings });
});

/**
 * POST /api/v1/settings/holidays
 * Appends a holiday entry.
 */
export const addHoliday = asyncHandler(async (req, res) => {
  const schoolId = req.user.schoolId;

  const settings = await SchoolSettings.findOneAndUpdate(
    { schoolId },
    { $push: { holidays: req.body } },
    { upsert: true, new: true, runValidators: true }
  );

  await cacheDel(settingsCacheKey(schoolId));
  // Return the newly added holiday (last element)
  const newHoliday = settings.holidays[settings.holidays.length - 1];
  return sendSuccess(res, { holiday: newHoliday, settings }, 201);
});

/**
 * DELETE /api/v1/settings/holidays/:holidayId
 * Removes a single holiday by its subdocument _id.
 */
export const deleteHoliday = asyncHandler(async (req, res) => {
  const schoolId   = req.user.schoolId;
  const holidayId  = req.params.holidayId;

  const settings = await SchoolSettings.findOne({ schoolId });
  if (!settings) return sendError(res, 'Settings not found.', 404);

  const holiday = settings.holidays.id(holidayId);
  if (!holiday) return sendError(res, 'Holiday not found.', 404);

  holiday.deleteOne();
  await settings.save();

  await cacheDel(settingsCacheKey(schoolId));
  return sendSuccess(res, { message: 'Holiday removed.' });
});

/**
 * POST /api/v1/settings/events
 * Appends a calendar event (sports day, midterm break, parents meeting, etc.)
 */
export const addCalendarEvent = asyncHandler(async (req, res) => {
  const schoolId = req.user.schoolId;

  const settings = await SchoolSettings.findOneAndUpdate(
    { schoolId },
    { $push: { calendarEvents: req.body } },
    { upsert: true, new: true, runValidators: true }
  );

  await cacheDel(settingsCacheKey(schoolId));
  const newEvent = settings.calendarEvents[settings.calendarEvents.length - 1];
  return sendSuccess(res, { event: newEvent, settings }, 201);
});

/**
 * DELETE /api/v1/settings/events/:eventId
 * Removes a single calendar event by its subdocument _id.
 */
export const deleteCalendarEvent = asyncHandler(async (req, res) => {
  const schoolId = req.user.schoolId;
  const { eventId } = req.params;

  const settings = await SchoolSettings.findOne({ schoolId });
  if (!settings) return sendError(res, 'Settings not found.', 404);

  const event = settings.calendarEvents.id(eventId);
  if (!event) return sendError(res, 'Event not found.', 404);

  event.deleteOne();
  await settings.save();

  await cacheDel(settingsCacheKey(schoolId));
  return sendSuccess(res, { message: 'Event removed.' });
});

/**
 * POST /api/v1/settings/logo
 * Upload/update school logo for official document branding.
 * Field name: "logo" (multipart/form-data)
 */
export const uploadSchoolLogo = asyncHandler(async (req, res) => {
  const schoolId = req.user.schoolId;

  const upload = await uploadBuffer(req.file.buffer, {
    folder: `school-branding/${schoolId}`,
    public_id: `school_logo_${schoolId}`,
    resource_type: 'image',
    overwrite: true,
  });

  if (!upload?.url) {
    return sendError(
      res,
      'Logo upload unavailable. Configure R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_ENDPOINT.',
      503
    );
  }

  const settings = await SchoolSettings.findOneAndUpdate(
    { schoolId },
    {
      $set: {
        logo: upload.publicId,
        logoPublicId: upload.publicId,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );

  await cacheDel(settingsCacheKey(schoolId));
  return sendSuccess(res, {
    message: 'School logo uploaded successfully.',
    logo: settings.logo,
    settings,
  });
});
