import { sendContactInquiryEmail } from '../../services/email.service.js';
import logger from '../../config/logger.js';

export const submitContactForm = async (req, res) => {
  const { firstName, lastName, email, phone, schoolName, message } = req.body;

  const missing = ['firstName', 'lastName', 'email', 'phone', 'schoolName'].filter(
    (k) => !req.body[k]?.toString().trim(),
  );
  if (missing.length) {
    return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}` });
  }

  try {
    await sendContactInquiryEmail({ firstName, lastName, email, phone, schoolName, message, meta: { type: 'contact_form' } });
    logger.info('[Contact] Inquiry received', { schoolName, email });
    return res.status(200).json({ success: true, message: 'Your request has been sent. We will be in touch within 24 hours.' });
  } catch (err) {
    logger.error('[Contact] Failed to send inquiry email', { err });
    return res.status(500).json({ success: false, message: 'Failed to send your request. Please email us directly at admin@diraschool.com.' });
  }
};
