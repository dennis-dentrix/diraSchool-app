import { sendEmail } from '../../services/email.service.js';
import logger from '../../config/logger.js';

const escapeHtml = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const submitContactForm = async (req, res) => {
  const { firstName, lastName, email, phone, schoolName, message } = req.body;

  const missing = ['firstName', 'lastName', 'email', 'phone', 'schoolName'].filter(
    (k) => !req.body[k]?.toString().trim(),
  );
  if (missing.length) {
    return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}` });
  }

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 16px;font-size:20px;color:#0d1f10">New school inquiry — DiraSchool</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 0;color:#666;width:140px">Name</td><td style="padding:8px 0;font-weight:600">${escapeHtml(firstName)} ${escapeHtml(lastName)}</td></tr>
        <tr><td style="padding:8px 0;color:#666">School</td><td style="padding:8px 0;font-weight:600">${escapeHtml(schoolName)}</td></tr>
        <tr><td style="padding:8px 0;color:#666">Email</td><td style="padding:8px 0"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        <tr><td style="padding:8px 0;color:#666">Phone</td><td style="padding:8px 0"><a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></td></tr>
        ${message ? `<tr><td style="padding:8px 0;color:#666;vertical-align:top">Message</td><td style="padding:8px 0">${escapeHtml(message)}</td></tr>` : ''}
      </table>
      <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/>
      <p style="font-size:12px;color:#999;margin:0">Submitted from diraschool.com — reply directly to follow up.</p>
    </div>
  `;

  try {
    await sendEmail({
      to: 'admin@diraschool.com',
      subject: `New inquiry: ${escapeHtml(schoolName)} — ${escapeHtml(firstName)} ${escapeHtml(lastName)}`,
      html,
      template: 'raw',
      meta: { type: 'contact_form', schoolName, email },
    });

    logger.info('[Contact] Inquiry received', { schoolName, email });
    return res.status(200).json({ success: true, message: 'Your request has been sent. We will be in touch within 24 hours.' });
  } catch (err) {
    logger.error('[Contact] Failed to send inquiry email', { err });
    return res.status(500).json({ success: false, message: 'Failed to send your request. Please email us directly at admin@diraschool.com.' });
  }
};
