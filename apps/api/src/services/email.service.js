// import { SendMailClient } from 'zeptomail'; // ← ZeptoMail (re-enable once credits topped up)
import { Resend } from 'resend';
import { env } from '../config/env.js';
import logger from '../config/logger.js';
import EmailEvent from '../features/email/EmailEvent.model.js';

// Parse "Name <addr>" → { name, address }
const parseFrom = (raw) => {
  const match = raw?.match(/^(.+?)\s*<([^>]+)>$/);
  return match
    ? { name: match[1].trim(), address: match[2].trim() }
    : { name: 'Diraschool', address: raw ?? 'noreply@contact.diraschool.com' };
};

const FROM_RAW = env.EMAIL_FROM ?? 'Diraschool <noreply@contact.diraschool.com>';
const FROM = parseFrom(FROM_RAW);

// ── ZeptoMail helpers (kept for when credits are restored) ───────────────────
// const normalizeZeptoUrl = (url) => {
//   const trimmed = String(url || '').trim() || 'api.zeptomail.com/';
//   return trimmed.includes('/v1.1') || trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
// };
// const normalizeZeptoToken = (token) => {
//   const trimmed = String(token || '').trim();
//   if (!trimmed || trimmed.toLowerCase().startsWith('zoho-enczapikey ')) return trimmed;
//   return `Zoho-enczapikey ${trimmed}`;
// };

const decodeHtmlEntities = (value) =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

const stripHtml = (value) => decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ''));

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const htmlToText = (html) => {
  const text = String(html || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
      const cleanLabel = stripHtml(label).trim();
      return cleanLabel ? `${cleanLabel}: ${href}` : href;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr|table|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return decodeHtmlEntities(text);
};

// ── ZeptoMail client (commented out — re-enable once credits are topped up) ──
// const zeptoClient = new SendMailClient({
//   url: normalizeZeptoUrl(env.ZEPTOMAIL_API_URL),
//   token: normalizeZeptoToken(env.ZEPTOMAIL_API_KEY),
// });
// const sendViaZeptoApi = async ({ to, subject, html }) => {
//   const data = await zeptoClient.sendMail({
//     from: { address: FROM.address, name: FROM.name },
//     to: [{ email_address: { address: to } }],
//     subject,
//     textbody: htmlToText(html),
//     htmlbody: html,
//   });
//   return {
//     provider: 'zeptomail',
//     providerMessageId: data?.data?.[0]?.message_id ?? data?.request_id,
//     providerStatus: 'accepted',
//   };
// };

// ── Resend client (active) ───────────────────────────────────────────────────
const resendClient = new Resend(env.RESEND_API_KEY);

logger.info('[Email] Resend configured', { from: FROM.address });

const sendViaResend = async ({ to, subject, html, attachments }) => {
  const payload = {
    from: `${FROM.name} <${FROM.address}>`,
    to,
    subject,
    html,
    text: htmlToText(html),
  };
  if (attachments?.length) payload.attachments = attachments;
  const { data, error } = await resendClient.emails.send(payload);

  if (error) {
    const err = new Error(error.message ?? 'Resend delivery error');
    err.code = error.name;
    err.providerError = error;
    throw err;
  }

  return {
    provider: 'resend',
    providerMessageId: data?.id,
    providerStatus: 'accepted',
  };
};

const safeJson = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const normalizeError = (err) => {
  if (typeof err === 'string') {
    return { message: err, code: undefined, details: err };
  }

  const firstData = Array.isArray(err?.data) ? err.data[0] : undefined;
  const firstErrorDetail = Array.isArray(err?.error?.details) ? err.error.details[0] : undefined;
  const firstDetail = Array.isArray(err?.details) ? err.details[0] : undefined;
  const message =
    err?.message ||
    err?.error?.message ||
    err?.details?.message ||
    firstErrorDetail?.message ||
    firstDetail?.message ||
    firstData?.message ||
    err?.errors?.[0]?.message ||
    'Unknown email delivery error';

  const code =
    err?.code ||
    err?.error?.code ||
    firstErrorDetail?.code ||
    firstDetail?.code ||
    firstData?.code ||
    err?.status;

  return {
    message,
    code: code ? String(code) : undefined,
    details: err ? safeJson(err) : undefined,
  };
};

const persistEmailEvent = async ({
  to,
  subject,
  template,
  provider,
  status,
  providerStatus,
  providerMessageId,
  accepted = [],
  rejected = [],
  errorMessage,
  errorCode,
  fallbackUsed = false,
  attemptOrder = 1,
  meta = {},
}) => {
  try {
    await EmailEvent.create({
      to,
      subject,
      template,
      provider,
      status,
      providerStatus,
      providerMessageId,
      accepted,
      rejected,
      errorMessage,
      errorCode,
      fallbackUsed,
      attemptOrder,
      schoolId: meta.schoolId ?? undefined,
      userId: meta.userId ?? undefined,
      deliveredAt: status === 'delivered' ? new Date() : undefined,
      lastCheckedAt: status === 'delivered' ? new Date() : undefined,
      meta,
    });
  } catch (err) {
    logger.error('[Email] Failed to persist EmailEvent', { to, template, provider, err: err.message });
  }
};

const sendEmail = async ({ to, subject, html, template, meta = {}, attachments }) => {
  try {
    const result = await sendViaResend({ to, subject, html, attachments });

    await persistEmailEvent({
      to, subject, template,
      provider: 'resend',
      status: 'sent',
      accepted: [to],
      rejected: [],
      ...result,
      meta,
    });

    logger.info('[Email] Sent email', { to, template, providerMessageId: result.providerMessageId });
    return result;
  } catch (err) {
    const normalized = normalizeError(err);
    await persistEmailEvent({
      to, subject, template,
      provider: 'resend',
      status: 'failed',
      errorMessage: normalized.message,
      errorCode: normalized.code,
      meta,
    });
    logger.warn('[Email] Email failed', {
      to,
      template,
      err: normalized.message,
      code: normalized.code,
      providerError: normalized.details,
    });
    const wrapped = new Error(normalized.message);
    wrapped.code = normalized.code;
    wrapped.provider = 'resend';
    wrapped.providerError = normalized.details;
    wrapped.cause = err;
    throw wrapped;
  }
};


export const sendVerificationEmail = ({
  to, firstName, schoolName, code, verifyUrl, expiresInMinutes = 30, meta = {},
}) =>
  sendEmail({
    to,
    subject: `${code} — verify your Diraschool account`,
    html: _verifyTemplate({ firstName, schoolName, code, verifyUrl, expiresInMinutes }),
    template: 'verification',
    meta,
  });

export const sendInviteEmail = ({
  to, firstName, schoolName, inviteUrl, childName, expiresInDays = 7, meta = {},
}) =>
  sendEmail({
    to,
    subject: `You've been added to ${schoolName} — set your password`,
    html: _inviteTemplate({ firstName, schoolName, inviteUrl, childName, expiresInDays }),
    template: 'invite',
    meta,
  });

export const sendNewSchoolInviteEmail = ({
  to, firstName, schoolName, inviteUrl, expiresInDays = 7, meta = {},
}) =>
  sendEmail({
    to,
    subject: `Your DiraSchool account is ready — ${schoolName}`,
    html: _newSchoolInviteTemplate({ firstName, schoolName, inviteUrl, expiresInDays }),
    template: 'new-school-invite',
    meta,
  });

export const sendParentEnrollmentEmail = ({
  to, firstName, schoolName, childName, isAdditionalChild = false, meta = {},
}) =>
  sendEmail({
    to,
    subject: `${childName} has been enrolled at ${schoolName}`,
    html: _parentEnrollmentTemplate({ firstName, schoolName, childName, isAdditionalChild }),
    template: 'parent-enrollment',
    meta,
  });

export const sendNewSchoolNotification = ({
  schoolName, schoolEmail, schoolPhone, county, adminName, meta = {},
}) =>
  sendEmail({
    to: 'diraschcontact@diraschool.com',
    subject: `New school registered — ${schoolName}`,
    html: _newSchoolTemplate({ schoolName, schoolEmail, schoolPhone, county, adminName }),
    template: 'new-school-notification',
    meta,
  });

export const sendSubscriptionConfirmationEmail = ({
  to, schoolName, amount, currency = 'KES', billingCycle, studentCount, merchantReference, paidAt, meta = {},
}) =>
  sendEmail({
    to,
    subject: `Subscription confirmed — ${schoolName}`,
    html: _subscriptionConfirmTemplate({ schoolName, amount, currency, billingCycle, studentCount, merchantReference, paidAt }),
    template: 'subscription-confirmation',
    meta,
  });

export const sendPasswordResetEmail = ({
  to, firstName, resetUrl, expiresInHours = 1, meta = {},
}) =>
  sendEmail({
    to,
    subject: 'Reset your Diraschool password',
    html: _resetTemplate({ firstName, resetUrl, expiresInHours }),
    template: 'password-reset',
    meta,
  });

export const sendSenderIdRequestNotification = ({
  schoolName, schoolId, senderIdRequested, requestedByEmail, meta = {},
}) =>
  sendEmail({
    to: 'diraschcontact@diraschool.com',
    subject: `SMS Sender ID request — ${schoolName}`,
    html: _senderIdRequestTemplate({ schoolName, schoolId, senderIdRequested, requestedByEmail }),
    template: 'sender-id-request',
    meta,
  });

export const sendSenderIdReviewedEmail = ({
  to, schoolName, action, senderIdApproved, rejectionReason, meta = {},
}) =>
  sendEmail({
    to,
    subject: action === 'approve'
      ? `Your SMS Sender ID has been approved — ${senderIdApproved}`
      : 'Your SMS Sender ID request was not approved',
    html: _senderIdReviewedTemplate({ schoolName, action, senderIdApproved, rejectionReason }),
    template: 'sender-id-reviewed',
    meta,
  });

export const sendSchoolDeactivationRequestNotification = ({
  schoolName, schoolId, schoolEmail, requestedBy, requestedByEmail, reason, meta = {},
}) =>
  sendEmail({
    to: 'diraschcontact@diraschool.com',
    subject: `School deactivation request — ${schoolName}`,
    html: _schoolDeactivationRequestTemplate({
      schoolName,
      schoolId,
      schoolEmail,
      requestedBy,
      requestedByEmail,
      reason,
    }),
    template: 'school-deactivation-request',
    meta,
  });

export const sendSchoolDeactivationReviewedEmail = ({
  to, schoolName, action, reviewNote, meta = {},
}) =>
  sendEmail({
    to,
    subject: action === 'approve'
      ? `Your Diraschool account deactivation was approved — ${schoolName}`
      : `Your Diraschool account deactivation request was not approved — ${schoolName}`,
    html: _schoolDeactivationReviewedTemplate({ schoolName, action, reviewNote }),
    template: 'school-deactivation-reviewed',
    meta,
  });

export const sendDepartmentMemberEmail = ({
  to, firstName, schoolName, departmentName, action, meta = {},
}) =>
  sendEmail({
    to,
    subject: action === 'added'
      ? `You've been added to the ${departmentName} department — ${schoolName}`
      : `You've been removed from the ${departmentName} department — ${schoolName}`,
    html: _departmentMemberTemplate({ firstName, schoolName, departmentName, action }),
    template: 'department-member',
    meta,
  });

export const sendAttendancePermissionEmail = ({
  to, firstName, schoolName, className, meta = {},
}) =>
  sendEmail({
    to,
    subject: `You've been assigned as class teacher of ${className} — ${schoolName}`,
    html: _attendancePermissionTemplate({ firstName, schoolName, className }),
    template: 'attendance-permission',
    meta,
  });

export const sendCheckoutReminderEmail = ({
  to, firstName, schoolName, checkOutTime, meta = {},
}) =>
  sendEmail({
    to,
    subject: `Reminder: please check out for today — ${schoolName}`,
    html: _checkoutReminderTemplate({ firstName, schoolName, checkOutTime }),
    template: 'checkout-reminder',
    meta,
  });

export const sendWelcomeEmail = ({
  to, firstName, schoolName, dashboardUrl, meta = {},
}) =>
  sendEmail({
    to,
    subject: `Welcome to Diraschool — let's get ${schoolName} set up`,
    html: _welcomeTemplate({ firstName, schoolName, dashboardUrl }),
    template: 'welcome',
    meta,
  });

export const sendTrialDay3Email = ({
  to, firstName, schoolName, dashboardUrl, trialDaysLeft, meta = {},
}) =>
  sendEmail({
    to,
    subject: `Quick check-in — how is ${schoolName} getting on?`,
    html: _trialDay3Template({ firstName, schoolName, dashboardUrl, trialDaysLeft }),
    template: 'trial-day3',
    meta,
  });

export const sendTrialMidpointEmail = ({
  to, firstName, schoolName, dashboardUrl, trialDaysLeft, meta = {},
}) =>
  sendEmail({
    to,
    subject: `You're halfway through your Diraschool trial — ${schoolName}`,
    html: _trialMidpointTemplate({ firstName, schoolName, dashboardUrl, trialDaysLeft }),
    template: 'trial-midpoint',
    meta,
  });

export const sendTrialExpiryEmail = ({
  to, firstName, schoolName, dashboardUrl, trialDaysLeft, meta = {},
}) =>
  sendEmail({
    to,
    subject: `Your Diraschool trial ends in ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} — ${schoolName}`,
    html: _trialExpiryTemplate({ firstName, schoolName, dashboardUrl, trialDaysLeft }),
    template: 'trial-expiry',
    meta,
  });

export const sendSystemEventEmail = ({
  to, firstName, eventTitle, eventBody, eventType, scheduledAt, meta = {},
}) =>
  sendEmail({
    to,
    subject: `[Diraschool] ${eventTitle}`,
    html: _systemEventTemplate({ firstName, eventTitle, eventBody, eventType, scheduledAt }),
    template: 'system-event',
    meta,
  });

const _departmentMemberTemplate = ({ firstName, schoolName, departmentName, action }) =>
  _shell(
    action === 'added' ? `Added to ${departmentName} — ${schoolName}` : `Removed from ${departmentName} — ${schoolName}`,
    action === 'added'
      ? `
        <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Hello ${firstName},</h2>
        <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
          You have been added to the <strong>${departmentName}</strong> department at
          <strong>${schoolName}</strong>.
        </p>
        <div style="background:#f0f4ff;border:1px solid #dbeafe;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
          <p style="margin:0;font-size:14px;color:#1e40af;line-height:1.6;">
            You can now collaborate with other members of this department through the school portal.
          </p>
        </div>
        <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
          If you believe this was done in error, please contact your school administrator.
        </p>
      `
      : `
        <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Hello ${firstName},</h2>
        <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
          You have been removed from the <strong>${departmentName}</strong> department at
          <strong>${schoolName}</strong>.
        </p>
        <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
          If you believe this was done in error, please contact your school administrator.
        </p>
      `
  );

const _attendancePermissionTemplate = ({ firstName, schoolName, className }) =>
  _shell(
    `Class teacher assignment — ${className}`,
    `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Hello ${firstName},</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
        You have been assigned as the class teacher of <strong>${className}</strong> at
        <strong>${schoolName}</strong>.
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0;font-size:14px;color:#15803d;line-height:1.6;">
          You can now take attendance registers for this class through the school portal.
          Log in and go to <strong>Attendance</strong> to get started.
        </p>
      </div>
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
        If you believe this was done in error, please contact your school administrator.
      </p>
    `
  );

const _checkoutReminderTemplate = ({ firstName, schoolName, checkOutTime }) =>
  _shell(
    `Reminder: check out — ${schoolName}`,
    `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Hi ${firstName}, don't forget to check out!</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
        It looks like you haven't checked out yet for today at <strong>${schoolName}</strong>.
        Your designated check-out time was <strong>${checkOutTime}</strong>.
      </p>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0;font-size:14px;color:#92400e;line-height:1.6;">
          Please open the Diraschool app and complete your check-out so your attendance is recorded accurately for today.
        </p>
      </div>
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
        If you have already checked out and received this message in error, please contact your school administrator.
      </p>
    `
  );

const _schoolDeactivationRequestTemplate = ({
  schoolName,
  schoolId,
  schoolEmail,
  requestedBy,
  requestedByEmail,
  reason,
}) =>
  _shell(
    `Deactivation request — ${schoolName}`,
    `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">School deactivation request</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
        <strong>${schoolName}</strong> has requested account deactivation.
      </p>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0 0 6px;font-size:14px;color:#92400e;"><strong>School ID:</strong> ${escapeHtml(schoolId)}</p>
        <p style="margin:0 0 6px;font-size:14px;color:#92400e;"><strong>School email:</strong> ${escapeHtml(schoolEmail)}</p>
        <p style="margin:0 0 6px;font-size:14px;color:#92400e;"><strong>Requested by:</strong> ${escapeHtml(requestedBy)} (${escapeHtml(requestedByEmail)})</p>
      </div>
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;">Reason</p>
      <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;white-space:pre-line;">${escapeHtml(reason)}</p>
    `
  );

const _schoolDeactivationReviewedTemplate = ({ schoolName, action, reviewNote }) =>
  _shell(
    action === 'approve'
      ? `Account deactivation approved — ${schoolName}`
      : `Account deactivation not approved — ${schoolName}`,
    action === 'approve'
      ? `
        <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Account deactivation approved</h2>
        <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
          Your Diraschool account for <strong>${schoolName}</strong> has been deactivated.
          Staff access has been disabled, and your school data remains preserved.
        </p>
        ${reviewNote ? `<p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;"><strong>Note:</strong> ${escapeHtml(reviewNote)}</p>` : ''}
      `
      : `
        <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Account deactivation request not approved</h2>
        <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
          Your Diraschool account for <strong>${schoolName}</strong> remains active.
        </p>
        ${reviewNote ? `<p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;"><strong>Reason:</strong> ${escapeHtml(reviewNote)}</p>` : ''}
      `
  );

const _welcomeTemplate = ({ firstName, schoolName, dashboardUrl }) =>
  _shell(
    `Welcome to Diraschool — ${schoolName}`,
    `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Welcome aboard, ${firstName}!</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
        Thank you for signing up <strong>${schoolName}</strong> on Diraschool.
        Your 30-day free trial has started — here are three things to do first to get the most out of it.
      </p>

      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:14px 16px;border-left:4px solid #1a56db;background:#f0f4ff;border-radius:0 6px 6px 0;">
            <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#1e40af;">1. Create your first class</p>
            <p style="margin:0;font-size:13px;color:#374151;line-height:1.5;">Go to <strong>Classes</strong> and add your class levels — Grade 1, Form 1, etc.</p>
          </td>
        </tr>
        <tr><td style="height:10px;"></td></tr>
        <tr>
          <td style="padding:14px 16px;border-left:4px solid #1a56db;background:#f0f4ff;border-radius:0 6px 6px 0;">
            <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#1e40af;">2. Add your students</p>
            <p style="margin:0;font-size:13px;color:#374151;line-height:1.5;">Import students via CSV or add them one by one under <strong>Students</strong>.</p>
          </td>
        </tr>
        <tr><td style="height:10px;"></td></tr>
        <tr>
          <td style="padding:14px 16px;border-left:4px solid #1a56db;background:#f0f4ff;border-radius:0 6px 6px 0;">
            <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#1e40af;">3. Configure your fee structure</p>
            <p style="margin:0;font-size:13px;color:#374151;line-height:1.5;">Set term fees under <strong>Fees</strong> so you can start tracking payments immediately.</p>
          </td>
        </tr>
      </table>

      ${_btn(dashboardUrl, 'Go to Dashboard →')}

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:28px 0 0;">
        <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#166534;">📞 We'll be in touch</p>
        <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6;">
          A member of the Diraschool team will call you shortly to help you get set up and answer any questions about the platform.
        </p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
          You can also reach us anytime on <strong><a href="tel:+254115879589" style="color:#166534;text-decoration:none;">0115 879 589</a></strong>
          or at <a href="mailto:contact@diraschool.com" style="color:#166534;">contact@diraschool.com</a>.
        </p>
      </div>
    `
  );

const _trialDay3Template = ({ firstName, schoolName, dashboardUrl, trialDaysLeft }) =>
  _shell(
    `Getting started — ${schoolName}`,
    `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Hi ${firstName}, just checking in</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
        It's been a few days since <strong>${schoolName}</strong> joined Diraschool.
        Have you had a chance to explore the system?
      </p>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#92400e;">Your trial setup checklist</p>
        <p style="margin:0 0 6px;font-size:14px;color:#374151;">&#9744; &nbsp;Create at least one class (e.g. Grade 4 North)</p>
        <p style="margin:0 0 6px;font-size:14px;color:#374151;">&#9744; &nbsp;Add 5 students to see how the system works</p>
        <p style="margin:0;font-size:14px;color:#374151;">&#9744; &nbsp;Record a fee payment to test the finance module</p>
      </div>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
        You have <strong>${trialDaysLeft} days</strong> remaining on your trial. No payment is required now.
      </p>
      ${_btn(dashboardUrl, 'Open Diraschool →')}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
        Stuck somewhere? Reply to this email — we'll help you get set up.
      </p>
    `
  );

const _trialMidpointTemplate = ({ firstName, schoolName, dashboardUrl, trialDaysLeft }) =>
  _shell(
    `Halfway through your trial — ${schoolName}`,
    `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">You're halfway there, ${firstName}</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
        <strong>${schoolName}</strong> has been on Diraschool for 15 days.
        You have <strong>${trialDaysLeft} days</strong> left on your free trial.
      </p>
      <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">Here's a reminder of what's included:</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
        <tr style="background:#f9fafb;">
          <td style="padding:9px 14px;font-weight:600;color:#111827;border:1px solid #e5e7eb;width:45%;">Student management</td>
          <td style="padding:9px 14px;color:#374151;border:1px solid #e5e7eb;">Track enrolment, profiles, and transfers</td>
        </tr>
        <tr>
          <td style="padding:9px 14px;font-weight:600;color:#111827;border:1px solid #e5e7eb;">Fee collection</td>
          <td style="padding:9px 14px;color:#374151;border:1px solid #e5e7eb;">Record and report on all term payments</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:9px 14px;font-weight:600;color:#111827;border:1px solid #e5e7eb;">Attendance</td>
          <td style="padding:9px 14px;color:#374151;border:1px solid #e5e7eb;">Daily registers with parent SMS alerts</td>
        </tr>
        <tr>
          <td style="padding:9px 14px;font-weight:600;color:#111827;border:1px solid #e5e7eb;">Exams &amp; report cards</td>
          <td style="padding:9px 14px;color:#374151;border:1px solid #e5e7eb;">CBC-aligned results and printable report cards</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:9px 14px;font-weight:600;color:#111827;border:1px solid #e5e7eb;">Parent portal</td>
          <td style="padding:9px 14px;color:#374151;border:1px solid #e5e7eb;">Parents view fees and results online</td>
        </tr>
      </table>
      <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
        Subscribing now keeps everything running without interruption.
        Pricing starts at <strong>KES 3,000 per term</strong> for up to 150 students.
      </p>
      ${_btn(dashboardUrl, 'Subscribe now →')}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
        Questions about pricing? Reply to this email and we'll help.
      </p>
    `
  );

const _trialExpiryTemplate = ({ firstName, schoolName, dashboardUrl, trialDaysLeft }) =>
  _shell(
    `Your trial ends in ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} — ${schoolName}`,
    `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Your trial ends soon, ${firstName}</h2>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0;font-size:15px;font-weight:700;color:#b91c1c;line-height:1.6;">
          ${schoolName}'s free trial ends in ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''}.
        </p>
      </div>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
        After your trial expires, staff and admin access will be paused until a subscription is activated.
        <strong>Your school data is safe</strong> — nothing is deleted.
      </p>
      <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
        Subscribe today to keep everything running without interruption.
        Pricing starts at <strong>KES 3,000 per term</strong> for up to 150 students.
      </p>
      ${_btn(dashboardUrl, 'Subscribe now — keep access →')}
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
        Or copy this link into your browser:<br/>
        <span style="color:#1a56db;word-break:break-all;">${dashboardUrl}</span>
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
        Need help or have questions about pricing? Reply to this email — we're here.
      </p>
    `
  );

const EVENT_TYPE_LABELS = {
  maintenance: 'Scheduled Maintenance',
  update: 'System Update',
  announcement: 'Announcement',
  outage: 'Service Outage',
  other: 'Notice',
};

const EVENT_TYPE_COLORS = {
  maintenance: '#d97706',
  update: '#1a56db',
  announcement: '#059669',
  outage: '#dc2626',
  other: '#6b7280',
};

const _systemEventTemplate = ({ firstName, eventTitle, eventBody, eventType = 'announcement', scheduledAt }) => {
  const label = EVENT_TYPE_LABELS[eventType] ?? 'Notice';
  const color = EVENT_TYPE_COLORS[eventType] ?? '#6b7280';
  const schedLine = scheduledAt
    ? `<p style="margin:0 0 16px;font-size:14px;color:#6b7280;">
         <strong>Scheduled for:</strong> ${new Date(scheduledAt).toUTCString()}
       </p>`
    : '';
  return _shell(
    eventTitle,
    `
      <div style="display:inline-block;background:${color}1a;color:${color};border:1px solid ${color}33;
                  padding:3px 10px;border-radius:4px;font-size:12px;font-weight:600;
                  text-transform:uppercase;letter-spacing:.5px;margin-bottom:20px;">
        ${label}
      </div>
      <h2 style="margin:0 0 12px;font-size:20px;color:#111827;">${escapeHtml(eventTitle)}</h2>
      ${firstName ? `<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${escapeHtml(firstName)},</p>` : ''}
      ${schedLine}
      <div style="background:#f9fafb;border-left:4px solid ${color};padding:16px 20px;border-radius:0 6px 6px 0;margin-bottom:20px;">
        <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;white-space:pre-line;">${escapeHtml(eventBody)}</p>
      </div>
      <p style="margin:0;font-size:13px;color:#6b7280;">
        This is an official system notice from Diraschool. No action is required unless stated above.
      </p>
    `,
  );
};

// Brand palette (matches globals.css CSS variables)
const BRAND = {
  primary:    '#1f5b5e',  // --primary: teal
  primaryDark:'#163f42',  // darker teal for hover/accents
  ink:        '#0f1410',  // --foreground
  paper:      '#f7f5f0',  // --background
  muted:      '#5a6b5d',  // --muted-foreground
  border:     '#e2e0db',
  dark:       '#161a18',  // --sidebar (dark panel)
};

const _shell = (title, body) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.paper};font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.paper};padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:8px;overflow:hidden;
                      box-shadow:0 2px 8px rgba(0,0,0,.08);max-width:600px;width:100%;">
          <tr>
            <td style="background:${BRAND.dark};padding:28px 40px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:.5px;">
                DiraSchool
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="background:${BRAND.paper};padding:20px 40px;border-top:1px solid ${BRAND.border};">
              <p style="margin:0;font-size:12px;color:${BRAND.muted};text-align:center;">
                This email was sent by DiraSchool School Management System.<br/>
                If you didn't expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const _btn = (url, label) =>
  `<a href="${url}"
     style="display:inline-block;background:${BRAND.primary};color:#ffffff;
            padding:14px 28px;border-radius:6px;text-decoration:none;
            font-size:15px;font-weight:600;margin:24px 0;"
  >${label}</a>`;

const _verifyTemplate = ({ firstName, schoolName, code, verifyUrl, expiresInMinutes }) =>
  _shell(
    `Verify your email — ${schoolName}`,
    `
      <h2 style="margin:0 0 16px;font-size:20px;color:${BRAND.ink};">Welcome to DiraSchool, ${firstName}!</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
        You've successfully created an account for <strong>${schoolName}</strong>.
        Verify your email to activate it — use either option below.
      </p>
      <p style="margin:20px 0 8px;font-size:12px;font-weight:700;color:${BRAND.muted};
                letter-spacing:.8px;text-transform:uppercase;">
        Option 1 — Enter this code on the verification screen
      </p>
      <div style="text-align:center;margin-bottom:4px;">
        <div style="display:inline-block;background:#eef5f5;border:2px solid ${BRAND.primary};
                    border-radius:10px;padding:18px 40px;">
          <p style="margin:0 0 4px;font-size:12px;color:${BRAND.muted};text-transform:uppercase;
                    letter-spacing:.5px;">Verification Code</p>
          <p style="margin:0;font-size:40px;font-weight:800;color:${BRAND.primary};letter-spacing:10px;
                    font-family:'Courier New',monospace;">${code}</p>
        </div>
      </div>
      <p style="text-align:center;font-size:13px;color:#9ca3af;margin:20px 0;">— or —</p>
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:${BRAND.muted};
                letter-spacing:.8px;text-transform:uppercase;">
        Option 2 — Click the link to verify instantly
      </p>
      ${_btn(verifyUrl, 'Verify My Email →')}
      <p style="margin:0 0 0;font-size:12px;color:${BRAND.muted};">
        Or copy into your browser:<br/>
        <span style="color:${BRAND.primary};word-break:break-all;">${verifyUrl}</span>
      </p>
      <hr style="border:none;border-top:1px solid ${BRAND.border};margin:28px 0;" />
      <p style="margin:0;font-size:13px;color:${BRAND.muted};">
        Both options expire in <strong>${expiresInMinutes} minutes</strong>.
        If they expire, request a new code from the login screen.
      </p>
    `
  );

const _inviteTemplate = ({ firstName, schoolName, inviteUrl, childName, expiresInDays }) =>
  _shell(
    `Invitation to ${schoolName}`,
    `
      <h2 style="margin:0 0 16px;font-size:20px;color:${BRAND.ink};">Hello ${firstName},</h2>
      ${childName ? `
      <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
        Your child <strong>${childName}</strong> has been successfully enrolled at
        <strong>${schoolName}</strong>.
      </p>
      ` : ''}
      <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
        Your account has been created on <strong>DiraSchool</strong> for
        <strong>${schoolName}</strong>.
      </p>
      <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
        Click the button below to set your password and access your account.
        This link expires in <strong>${expiresInDays} days</strong>.
      </p>
      ${_btn(inviteUrl, 'Set My Password →')}
      <p style="margin:4px 0 0;font-size:12px;color:${BRAND.muted};">
        Or copy this link into your browser:<br/>
        <span style="color:${BRAND.primary};word-break:break-all;">${inviteUrl}</span>
      </p>
      <hr style="border:none;border-top:1px solid ${BRAND.border};margin:28px 0;" />
      <p style="margin:0;font-size:13px;color:${BRAND.muted};">
        If you weren't expecting this invitation, contact your school administrator.
      </p>
    `
  );

const _newSchoolInviteTemplate = ({ firstName, schoolName, inviteUrl, expiresInDays }) =>
  _shell(
    `Your DiraSchool account is ready — ${schoolName}`,
    `
      <h2 style="margin:0 0 8px;font-size:22px;color:${BRAND.ink};">Welcome to DiraSchool, ${firstName}!</h2>
      <p style="margin:0 0 24px;font-size:15px;color:${BRAND.muted};line-height:1.6;">
        <strong>${schoolName}</strong> is now set up and ready to go.
      </p>

      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
        You're the account administrator. Once you set your password, you can:
      </p>

      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">
        ${[
          ['Add classes and students', 'Get your school register set up in minutes'],
          ['Manage staff accounts',    'Invite teachers, secretaries, and other staff'],
          ['Track fees and payments',  'Record payments and generate receipts instantly'],
          ['Attendance and reports',   'Daily attendance, CBC report cards, and more'],
        ].map(([title, desc]) => `
        <tr>
          <td style="padding:8px 0;vertical-align:top;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:28px;vertical-align:top;padding-top:1px;">
                  <span style="display:inline-block;width:18px;height:18px;background:${BRAND.primary};
                               border-radius:50%;text-align:center;line-height:18px;
                               font-size:11px;color:#fff;font-weight:700;">✓</span>
                </td>
                <td>
                  <p style="margin:0;font-size:14px;font-weight:600;color:${BRAND.ink};">${title}</p>
                  <p style="margin:2px 0 0;font-size:13px;color:${BRAND.muted};">${desc}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`).join('')}
      </table>

      <p style="margin:0 0 4px;font-size:15px;color:#374151;line-height:1.6;">
        Set your password to activate your account. This link expires in <strong>${expiresInDays} days</strong>.
      </p>
      ${_btn(inviteUrl, 'Activate My Account →')}
      <p style="margin:4px 0 0;font-size:12px;color:${BRAND.muted};">
        Or copy this link into your browser:<br/>
        <span style="color:${BRAND.primary};word-break:break-all;">${inviteUrl}</span>
      </p>

      <hr style="border:none;border-top:1px solid ${BRAND.border};margin:28px 0;" />
      <p style="margin:0;font-size:13px;color:${BRAND.muted};">
        Need help getting started? Reply to this email or reach us at
        <a href="mailto:admin@diraschool.com" style="color:${BRAND.primary};text-decoration:none;">admin@diraschool.com</a>.
      </p>
    `
  );

const _parentEnrollmentTemplate = ({ firstName, schoolName, childName, isAdditionalChild }) =>
  _shell(
    `${childName} enrolled at ${schoolName}`,
    `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Hello ${firstName},</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
        ${
  isAdditionalChild
    ? `Your child <strong>${childName}</strong> has been added to your parent account at <strong>${schoolName}</strong>.`
    : `Your child <strong>${childName}</strong> has been successfully enrolled at <strong>${schoolName}</strong>.`
}
      </p>
      <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
        You can sign in to your existing Diraschool parent portal account to view fees, attendance,
        results, and report cards.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />
      <p style="margin:0;font-size:13px;color:#6b7280;">
        If this update is unexpected, contact your school administrator.
      </p>
    `
  );

const _newSchoolTemplate = ({ schoolName, schoolEmail, schoolPhone, county, adminName }) =>
  _shell(
    `New school registered — ${schoolName}`,
    `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">New school registration</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
        A new school has just signed up for a free trial on Diraschool.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;font-weight:600;color:#374151;width:140px;border:1px solid #e5e7eb;">School name</td>
          <td style="padding:10px 14px;color:#111827;border:1px solid #e5e7eb;">${schoolName}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Admin email</td>
          <td style="padding:10px 14px;color:#111827;border:1px solid #e5e7eb;">${schoolEmail}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Admin name</td>
          <td style="padding:10px 14px;color:#111827;border:1px solid #e5e7eb;">${adminName}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Phone</td>
          <td style="padding:10px 14px;color:#111827;border:1px solid #e5e7eb;">${schoolPhone || '—'}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">County</td>
          <td style="padding:10px 14px;color:#111827;border:1px solid #e5e7eb;">${county || '—'}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Registered at</td>
          <td style="padding:10px 14px;color:#111827;border:1px solid #e5e7eb;">${new Date().toUTCString()}</td>
        </tr>
      </table>
    `
  );

const _fmtAmount = (n, currency = 'KES') => `${currency} ${Math.round(n).toLocaleString('en-KE')}`;
const _fmtCycle = (c) => ({ 'per-term': 'Per Term', annual: 'Annual (3 terms, 15% off)', 'multi-year': '3-Year Annual (20% off)' }[c] ?? c);
const _fmtDate = (d) => new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' });

const _subscriptionConfirmTemplate = ({ schoolName, amount, currency = 'KES', billingCycle, studentCount, merchantReference, paidAt }) =>
  _shell(
    `Subscription confirmed — ${schoolName}`,
    `
      <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Payment received — you're all set!</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
        Thank you — <strong>${schoolName}</strong>'s DiraSchool subscription has been activated.
        Your school now has full access to all features.
      </p>
      <table cellpadding="0" cellspacing="0"
             style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
        <tr style="background:#f0f4ff;">
          <td style="padding:10px 14px;font-weight:600;color:#374151;width:160px;border:1px solid #dbeafe;">Amount paid</td>
          <td style="padding:10px 14px;color:#111827;font-weight:700;border:1px solid #dbeafe;">${_fmtAmount(amount, currency)} (incl. 16% VAT)</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Billing cycle</td>
          <td style="padding:10px 14px;color:#111827;border:1px solid #e5e7eb;">${_fmtCycle(billingCycle)}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Enrolled students</td>
          <td style="padding:10px 14px;color:#111827;border:1px solid #e5e7eb;">${studentCount ?? '—'}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Payment date</td>
          <td style="padding:10px 14px;color:#111827;border:1px solid #e5e7eb;">${_fmtDate(paidAt)}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Reference</td>
          <td style="padding:10px 14px;color:#6b7280;font-family:'Courier New',monospace;font-size:12px;border:1px solid #e5e7eb;">${merchantReference}</td>
        </tr>
      </table>
      <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6;">
        Log in to your DiraSchool dashboard to view your billing details and download a full invoice.
        Keep this email as your payment receipt.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="margin:0;font-size:13px;color:#6b7280;">
        Questions? Reply to this email or contact us at
        <a href="mailto:contact@diraschool.com" style="color:#1a56db;">contact@diraschool.com</a>.
      </p>
    `
  );

const _resetTemplate = ({ firstName, resetUrl, expiresInHours }) =>
  _shell(
    'Reset your Diraschool password',
    `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Hello ${firstName},</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
        We received a request to reset the password for your Diraschool account.
      </p>
      <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
        Click the button below to choose a new password.
        This link expires in <strong>${expiresInHours} hour${expiresInHours !== 1 ? 's' : ''}</strong>.
      </p>
      ${_btn(resetUrl, 'Reset My Password →')}
      <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">
        Or copy this link into your browser:<br/>
        <span style="color:#1a56db;word-break:break-all;">${resetUrl}</span>
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />
      <p style="margin:0;font-size:13px;color:#6b7280;">
        If you didn't request a password reset, ignore this email — your password
        won't change.
      </p>
    `
  );

const _senderIdRequestTemplate = ({ schoolName, schoolId, senderIdRequested, requestedByEmail }) =>
  _shell(
    `SMS Sender ID request — ${schoolName}`,
    `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Sender ID approval needed</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
        A school has requested a custom SMS Sender ID. Review and approve or reject it in the superadmin panel.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;font-weight:600;color:#374151;width:160px;border:1px solid #e5e7eb;">School</td>
          <td style="padding:10px 14px;color:#111827;border:1px solid #e5e7eb;">${schoolName}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Requested by</td>
          <td style="padding:10px 14px;color:#111827;border:1px solid #e5e7eb;">${requestedByEmail}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Requested Sender ID</td>
          <td style="padding:10px 14px;font-family:monospace;font-size:16px;font-weight:700;color:#1a56db;border:1px solid #e5e7eb;">${senderIdRequested}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">School ID</td>
          <td style="padding:10px 14px;font-family:monospace;color:#6b7280;border:1px solid #e5e7eb;">${schoolId}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Requested at</td>
          <td style="padding:10px 14px;color:#111827;border:1px solid #e5e7eb;">${new Date().toUTCString()}</td>
        </tr>
      </table>
      <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">
        Log in to the superadmin panel → Schools → find this school → SMS tab to approve or reject.
      </p>
    `
  );

const _senderIdReviewedTemplate = ({ schoolName, action, senderIdApproved, rejectionReason }) =>
  _shell(
    action === 'approve' ? `Sender ID approved — ${senderIdApproved}` : 'Sender ID request not approved',
    action === 'approve'
      ? `
        <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Your Sender ID has been approved ✓</h2>
        <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
          Great news! Your custom SMS Sender ID for <strong>${schoolName}</strong> has been approved.
          Your messages will now be delivered using:
        </p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;text-align:center;margin:0 0 20px;">
          <span style="font-family:monospace;font-size:24px;font-weight:700;color:#15803d;letter-spacing:2px;">${senderIdApproved}</span>
        </div>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
          No action is needed — your school's SMS messages will automatically use this Sender ID.
          It may take up to 24 hours to become active on all networks.
        </p>
      `
      : `
        <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Sender ID request not approved</h2>
        <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
          Unfortunately, your SMS Sender ID request for <strong>${schoolName}</strong> could not be approved at this time.
        </p>
        ${rejectionReason ? `
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:0 0 20px;">
          <p style="margin:0;font-size:14px;color:#b91c1c;line-height:1.6;"><strong>Reason:</strong> ${rejectionReason}</p>
        </div>` : ''}
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
          You can submit a new request from your school's Settings page. If you have questions, reply to this email.
        </p>
      `
  );

export const sendContactInquiryConfirmationEmail = ({ firstName, schoolName, email, phone, meta = {} }) =>
  sendEmail({
    to: email,
    subject: `We've received your request — DiraSchool`,
    html: _shell(
      `We've received your request — DiraSchool`,
      `
        <h2 style="margin:0 0 8px;font-size:22px;color:#0d1f10;font-weight:700;">
          Thank you, ${firstName}.
        </h2>
        <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
          We've received your request to set up <strong>${schoolName}</strong> on DiraSchool.
          Our team will review your details and reach out within <strong>24 hours</strong> to get you started.
        </p>

        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:0 0 24px;">
          <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#166534;text-transform:uppercase;letter-spacing:.05em;">
            What happens next
          </p>
          <ol style="margin:0;padding-left:18px;font-size:14px;color:#374151;line-height:2;">
            <li>Our team reviews your school details</li>
            <li>We call or email you to confirm and answer any questions</li>
            <li>Your school account is created and you receive login instructions</li>
            <li>We walk you through your first setup call if needed</li>
          </ol>
        </div>

        <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.7;">
          In the meantime, if you have any questions reach us directly:
        </p>
        <table style="font-size:14px;color:#374151;line-height:2;">
          <tr><td style="padding-right:12px;color:#6b7280;">Email</td><td><a href="mailto:admin@diraschool.com" style="color:#1f5b5e;text-decoration:none;font-weight:600;">admin@diraschool.com</a></td></tr>
          <tr><td style="padding-right:12px;color:#6b7280;">Phone</td><td><a href="tel:+254115879589" style="color:#1f5b5e;text-decoration:none;font-weight:600;">+254 115 879 589</a></td></tr>
        </table>

        <hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb;"/>

        <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
          You submitted this request using <strong>${email}</strong> and phone <strong>${phone}</strong>.
          If any of these details are incorrect, reply to this email and we'll update them.
        </p>
      `
    ),
    template: 'contact-inquiry-confirmation',
    meta,
  });

export const sendContactInquiryEmail = ({ firstName, lastName, schoolName, email, phone, message, meta = {} }) =>
  sendEmail({
    to: 'admin@diraschool.com',
    subject: `New inquiry: ${schoolName} — ${firstName} ${lastName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 16px;font-size:20px;color:#0d1f10">New school inquiry — DiraSchool</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:8px 0;color:#666;width:140px">Name</td><td style="padding:8px 0;font-weight:600">${firstName} ${lastName}</td></tr>
          <tr><td style="padding:8px 0;color:#666">School</td><td style="padding:8px 0;font-weight:600">${schoolName}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Email</td><td style="padding:8px 0"><a href="mailto:${email}">${email}</a></td></tr>
          <tr><td style="padding:8px 0;color:#666">Phone</td><td style="padding:8px 0"><a href="tel:${phone}">${phone}</a></td></tr>
          ${message ? `<tr><td style="padding:8px 0;color:#666;vertical-align:top">Message</td><td style="padding:8px 0">${message}</td></tr>` : ''}
        </table>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/>
        <p style="font-size:12px;color:#999;margin:0">Submitted from diraschool.com — reply directly to follow up.</p>
      </div>
    `,
    template: 'contact-inquiry',
    meta,
  });

export const sendWeeklySummaryEmail = ({ to, schoolName, weekLabel, attachments }) =>
  sendEmail({
    to,
    subject: `Weekly School Summary — ${weekLabel} | ${schoolName}`,
    html: _shell(
      `Weekly Summary — ${weekLabel}`,
      `
        <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Weekly School Summary</h2>
        <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
          Please find attached your weekly summary reports for <strong>${schoolName}</strong> covering the week of <strong>${weekLabel}</strong>.
        </p>
        <div style="background:#f0f4ff;border:1px solid #dbeafe;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
          <p style="margin:0 0 8px;font-size:14px;color:#1e40af;font-weight:600;">Attached reports:</p>
          <ul style="margin:0;padding-left:18px;font-size:14px;color:#1e40af;line-height:1.8;">
            <li>Student Attendance Summary</li>
            <li>Teacher Check-In Report</li>
            <li>Fees Collection Summary</li>
          </ul>
        </div>
        <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
          These reports are generated automatically every Saturday morning. Log in to your dashboard for detailed records.
        </p>
      `
    ),
    template: 'weekly-summary',
    attachments,
    meta: { schoolName, weekLabel },
  });
