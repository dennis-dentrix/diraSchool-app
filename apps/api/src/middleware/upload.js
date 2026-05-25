import multer from 'multer';
import { sendError } from '../utils/response.js';
import { IMPORT_ALLOWED_MIME, IMPORT_ALLOWED_EXTENSIONS } from '../utils/parseImportFile.js';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

const importFileFilter = (_req, file, cb) => {
  const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
  if (IMPORT_ALLOWED_MIME.has(file.mimetype) || IMPORT_ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV or Excel files (.csv, .xlsx, .xls, .ods) are allowed.'));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: importFileFilter,
});

const imageUpload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (String(file.mimetype).startsWith('image/')) return cb(null, true);
    return cb(new Error('Only image files are allowed.'));
  },
});

/**
 * Single-file upload middleware for CSV/Excel imports.
 * Field name must be "file".
 * Wraps multer errors into the standard API error response format.
 */
export const uploadCsv = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return sendError(res, 'Import file must be 5 MB or smaller.', 400);
      }
      return sendError(res, err.message, 400);
    }
    if (err) {
      return sendError(res, err.message, 400);
    }
    if (!req.file) {
      return sendError(res, 'A file is required (field name: "file").', 400);
    }
    next();
  });
};

/**
 * Single-image upload middleware.
 * Default field name: "file", max size: 5 MB.
 */
export const uploadImage = (fieldName = 'file') => (req, res, next) => {
  imageUpload.single(fieldName)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return sendError(res, 'Image file must be 5 MB or smaller.', 400);
      }
      return sendError(res, err.message, 400);
    }
    if (err) return sendError(res, err.message, 400);
    if (!req.file) return sendError(res, `An image file is required (field name: "${fieldName}").`, 400);
    next();
  });
};

/**
 * Multiple-image upload middleware.
 * Field name: "images", up to 20 files, 10 MB each.
 */
const multiImageUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (String(file.mimetype).startsWith('image/')) return cb(null, true);
    return cb(new Error('Only image files are allowed.'));
  },
});

export const uploadImages = (fieldName = 'images', maxCount = 20) => (req, res, next) => {
  multiImageUpload.array(fieldName, maxCount)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return sendError(res, 'Each image must be 10 MB or smaller.', 400);
      if (err.code === 'LIMIT_UNEXPECTED_FILE') return sendError(res, `Maximum ${maxCount} images allowed.`, 400);
      return sendError(res, err.message, 400);
    }
    if (err) return sendError(res, err.message, 400);
    next();
  });
};
