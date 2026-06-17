import {
  sendContactInquiryEmail,
  sendContactInquiryConfirmationEmail,
} from '../../services/email.service.js';
import SchoolInquiry from './SchoolInquiry.model.js';
import logger from '../../config/logger.js';
import asyncHandler from '../../utils/asyncHandler.js';

export const submitContactForm = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phone, schoolName, message } = req.body;

  const missing = ['firstName', 'lastName', 'email', 'phone', 'schoolName'].filter(
    (k) => !req.body[k]?.toString().trim(),
  );
  if (missing.length) {
    return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}` });
  }

  const inquiry = await SchoolInquiry.create({
    firstName, lastName, email, phone, schoolName, message: message?.trim() || '',
  });

  // Fire both emails concurrently — a failure in one does not block the other
  const [adminResult, confirmResult] = await Promise.allSettled([
    sendContactInquiryEmail({ firstName, lastName, schoolName, email, phone, message, meta: { inquiryId: inquiry._id.toString() } }),
    sendContactInquiryConfirmationEmail({ firstName, schoolName, email, phone, meta: { inquiryId: inquiry._id.toString() } }),
  ]);

  if (adminResult.status === 'rejected') {
    logger.error('[Contact] Failed to send admin notification', { err: adminResult.reason, inquiryId: inquiry._id });
  }
  if (confirmResult.status === 'rejected') {
    logger.error('[Contact] Failed to send confirmation to applicant', { err: confirmResult.reason, inquiryId: inquiry._id });
  }

  logger.info('[Contact] Inquiry saved', { schoolName, email, inquiryId: inquiry._id });

  return res.status(200).json({
    success: true,
    message: 'Your request has been sent. We will be in touch within 24 hours.',
  });
});
