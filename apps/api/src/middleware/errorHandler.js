import mongoose from 'mongoose';
import logger from '../config/logger.js';
import { captureError } from '../config/sentry.js';

/**
 * Global error handler. All async errors land here via asyncHandler.
 * Normalises Mongoose, JWT, and duplicate key errors into consistent API responses.
 * Never return a raw 500 — always try to give a meaningful message.
 */
const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong';

  // Mongoose validation error
  if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    const first = Object.values(err.errors)[0];
    message = first.message;
  }

  // Mongoose cast error (invalid ObjectId)
  if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // MongoDB duplicate key error — 409 Conflict is the correct HTTP status
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = field ? `${field} already exists` : 'Duplicate value error';
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token. Please log in again.';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired. Please log in again.';
  }

  // Log server errors with full structured context
  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.url} → ${statusCode}`, {
      message: err.message,
      stack: err.stack,
      userId: req.user?._id,
      schoolId: req.user?.schoolId,
      body: req.body,
    });
    captureError(err, {
      request: {
        method: req.method,
        url: req.originalUrl || req.url,
        userId: req.user?._id?.toString(),
        schoolId: req.user?.schoolId?.toString(),
      },
    });
    // Never expose internal error details to clients in production
    if (process.env.NODE_ENV === 'production') {
      message = 'An unexpected error occurred. Our team has been notified.';
    }
  } else if (statusCode >= 400 && process.env.NODE_ENV !== 'test') {
    // 4xx: debug-level — useful for tracing bad requests without noise
    logger.debug(`${req.method} ${req.url} → ${statusCode}: ${message}`, {
      userId: req.user?._id,
    });
  }

  return res.status(statusCode).json({ message });
};

export default errorHandler;
