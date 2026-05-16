import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — DiraSchool',
  description: 'How DiraSchool collects, uses, and protects data for Kenyan CBC schools. Compliant with the Kenya Data Protection Act, 2019.',
  alternates: { canonical: 'https://diraschool.com/privacy' },
};

const EFFECTIVE_DATE = '7 May 2026';
const CONTACT_EMAIL = 'contact@diraschool.com';

function Section({ title, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-slate-900 mb-4">{title}</h2>
      <div className="space-y-3 text-slate-600 leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-slate-200 bg-white/80 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-bold text-slate-900 text-sm">← Diraschool</Link>
          <Link href="/terms" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">Terms of Service</Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-slate-500">Effective: {EFFECTIVE_DATE}</p>
        </div>

        <Section title="1. Who We Are">
          <p>
            DiraSchool ("we", "us", "our") is a cloud-based school management platform built for
            Kenyan Competency Based Curriculum (CBC) schools. We are operated by Dentrix Technologies,
            registered in Kenya. Our registered address and data controller contact is{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#1f5b5e] hover:underline">{CONTACT_EMAIL}</a>.
          </p>
          <p>
            This Privacy Policy explains how we collect, use, store, and share personal data when you
            use DiraSchool at{' '}
            <a href="https://diraschool.com" className="text-[#1f5b5e] hover:underline">diraschool.com</a>{' '}
            and its associated APIs. It is written in compliance with the{' '}
            <strong>Kenya Data Protection Act, 2019</strong> and its regulations.
          </p>
        </Section>

        <Section title="2. Data We Collect">
          <p>We collect data in the following categories depending on who you are:</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 pr-4 font-semibold text-slate-700">Category</th>
                  <th className="text-left py-2 pr-4 font-semibold text-slate-700">Examples</th>
                  <th className="text-left py-2 font-semibold text-slate-700">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-slate-800 align-top">School account</td>
                  <td className="py-2.5 pr-4 align-top">School name, county, phone number, email</td>
                  <td className="py-2.5 align-top">Provision of service, billing, communication</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-slate-800 align-top">Staff & admin</td>
                  <td className="py-2.5 pr-4 align-top">Name, email, phone number, role, profile photo</td>
                  <td className="py-2.5 align-top">Authentication, access control, audit logs</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-slate-800 align-top">Student records</td>
                  <td className="py-2.5 pr-4 align-top">Full name, admission number, date of birth, gender, class, guardian details</td>
                  <td className="py-2.5 align-top">School operations, CBC report cards, fee tracking</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-slate-800 align-top">Academic data</td>
                  <td className="py-2.5 pr-4 align-top">Exam marks, attendance records, report card grades, learning area assessments</td>
                  <td className="py-2.5 align-top">CBC reporting, analytics, parent portal</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-slate-800 align-top">Financial data</td>
                  <td className="py-2.5 pr-4 align-top">Fee payments, M-Pesa references, balances</td>
                  <td className="py-2.5 align-top">Fee management, receipts, financial reporting</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-slate-800 align-top">Usage & technical</td>
                  <td className="py-2.5 pr-4 align-top">IP address, browser type, pages visited, error logs, audit trail</td>
                  <td className="py-2.5 align-top">Security monitoring, debugging, fraud prevention</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            We do not collect biometric data, health records beyond what the school chooses to enter,
            or any special categories of personal data as defined under Section 46 of the Data Protection
            Act unless explicitly provided by the school administrator.
          </p>
        </Section>

        <Section title="3. Legal Basis for Processing">
          <p>We process personal data under the following lawful bases (Section 30, Data Protection Act 2019):</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Contract performance</strong> — processing necessary to deliver the school management service.</li>
            <li><strong>Legitimate interests</strong> — security monitoring, fraud prevention, and product improvement.</li>
            <li><strong>Consent</strong> — where you explicitly opt in (e.g. marketing emails). You may withdraw consent at any time.</li>
            <li><strong>Legal obligation</strong> — compliance with Kenyan law where applicable.</li>
          </ul>
        </Section>

        <Section title="4. How We Use Your Data">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Providing, maintaining, and improving the DiraSchool platform.</li>
            <li>Generating and publishing CBC-compliant report cards and attendance records.</li>
            <li>Processing fee payments and generating receipts.</li>
            <li>Sending SMS notifications to parents and guardians via Celcom Africa or another configured SMS gateway (see Section 5).</li>
            <li>Sending transactional emails (account creation, password reset, subscription alerts).</li>
            <li>Auditing all administrative actions for accountability within your school.</li>
            <li>Responding to support requests.</li>
            <li>Preventing unauthorised access and complying with legal obligations.</li>
          </ul>
          <p>
            We do <strong>not</strong> sell, rent, or trade your personal data to third parties for marketing.
            We do not use student data for advertising or profiling.
          </p>
        </Section>

        <Section title="5. Third-Party Service Providers">
          <p>We share data with the following sub-processors only to the extent necessary to deliver the service:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>
              <strong>Celcom Africa (SMS)</strong> — Phone numbers are transmitted to send parent
              notifications and OTP verification messages. Celcom Africa operates under their own
              Privacy Policy and is compliant with applicable Kenyan telecoms regulations.
            </li>
            <li>
              <strong>DigitalOcean (Hosting &amp; Storage)</strong> — All application data is stored on
              DigitalOcean managed infrastructure in the AMS3 (Amsterdam) region with encrypted at-rest
              storage. File uploads (photos, lesson plans) are stored on DigitalOcean Spaces object storage.
              We are actively working to move to an East Africa region as one becomes available.
            </li>
            <li>
              <strong>ZeptoMail by Zoho (Transactional Email)</strong> — Email addresses are shared solely
              for delivering transactional messages such as account verification, password resets, and
              subscription notices.
            </li>
            <li>
              <strong>Paystack (Payment Processing)</strong> — Subscription renewal and SMS credit
              purchases are processed via Paystack. Card and payment details are handled directly by
              Paystack and are never stored by DiraSchool.
            </li>
            <li>
              <strong>Safaricom (M-Pesa)</strong> — For schools using M-Pesa fee collection, payment
              transaction data (amount, reference, phone number) is shared with Safaricom via the Daraja
              API to process and confirm payments. Money flows directly to the school's M-Pesa paybill.
            </li>
          </ul>
        </Section>

        <Section title="6. Data Retention">
          <p>
            We retain personal data for as long as your school's account is active and for{' '}
            <strong>3 years after account closure</strong>, after which it is permanently deleted or
            anonymised. You may request earlier deletion (see Section 9). Financial records may be
            retained for 7 years in line with Kenyan tax and audit requirements.
          </p>
          <p>
            Individual audit log entries are retained for 2 years. SMS delivery logs are retained for
            90 days. Session cookies expire within 24 hours of inactivity.
          </p>
        </Section>

        <Section title="7. Data Security">
          <p>
            We implement the following technical and organisational measures to protect your data:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>TLS encryption for all data in transit.</li>
            <li>Encrypted at-rest storage on managed MongoDB clusters.</li>
            <li>HTTP-only cookies for session tokens (not accessible to JavaScript).</li>
            <li>Role-based access control — every user only sees data for their school (multi-tenant isolation).</li>
            <li>Comprehensive audit logs of all create, update, and delete operations.</li>
            <li>CSRF protection on all mutating API endpoints.</li>
            <li>Rate limiting on authentication endpoints to prevent brute force attacks.</li>
          </ul>
          <p>
            Despite these measures, no internet transmission is completely secure. In the event of a
            data breach that is likely to result in risk to your rights and freedoms, we will notify
            you and the Office of the Data Protection Commissioner within 72 hours as required by law.
          </p>
        </Section>

        <Section title="8. Cookies">
          <p>
            DiraSchool uses a single HTTP-only authentication cookie (<code className="text-sm bg-[#ede9e2] px-1 rounded">token</code>)
            that is strictly necessary for you to stay logged in. We do not use third-party tracking
            cookies or advertising cookies. We do not use Google Analytics or Facebook Pixel.
          </p>
        </Section>

        <Section title="9. Your Rights Under the Kenya Data Protection Act 2019">
          <p>As a data subject, you have the following rights:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Right to access</strong> — request a copy of the personal data we hold about you.</li>
            <li><strong>Right to rectification</strong> — request correction of inaccurate data.</li>
            <li><strong>Right to erasure</strong> — request deletion of your data (subject to legal retention obligations).</li>
            <li><strong>Right to portability</strong> — export your school's data in a machine-readable format (CSV export is available within the platform).</li>
            <li><strong>Right to object</strong> — object to processing based on legitimate interests.</li>
            <li><strong>Right to restriction</strong> — request we limit processing of your data in certain circumstances.</li>
          </ul>
          <p>
            To exercise any of these rights, email us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#1f5b5e] hover:underline">{CONTACT_EMAIL}</a>{' '}
            with the subject line "Data Rights Request". We will respond within 21 days. You also have
            the right to lodge a complaint with the{' '}
            <strong>Office of the Data Protection Commissioner of Kenya (ODPC)</strong>.
          </p>
        </Section>

        <Section title="10. Children's Data">
          <p>
            DiraSchool processes student data on behalf of schools, which may include data of children
            under 18. This data is processed under the school's direction and responsibility as the data
            controller. Schools must ensure they have appropriate consent or lawful basis from parents
            or guardians in line with their own privacy obligations.
          </p>
          <p>
            We do not allow children to create DiraSchool accounts directly. Children access the
            platform only through the parent portal, managed by a responsible adult.
          </p>
        </Section>

        <Section title="11. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. We will notify all school administrators
            by email at least 14 days before material changes take effect. Continued use of DiraSchool
            after the effective date of the revised policy constitutes acceptance. The current version
            is always available at{' '}
            <a href="https://diraschool.com/privacy" className="text-[#1f5b5e] hover:underline">diraschool.com/privacy</a>.
          </p>
        </Section>

        <Section title="12. Contact Us">
          <p>
            For privacy-related questions, data requests, or concerns:
          </p>
          <div className="mt-3 p-4 bg-[#f7f5f0] rounded-lg border border-[#ddd8d0] text-sm space-y-1">
            <p><strong>DiraSchool — Data Protection Contact</strong></p>
            <p>
              Email:{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#1f5b5e] hover:underline">{CONTACT_EMAIL}</a>
            </p>
            <p>Website: <a href="https://diraschool.com" className="text-[#1f5b5e] hover:underline">diraschool.com</a></p>
            <p>Country: Kenya</p>
          </div>
        </Section>

        <div className="pt-6 border-t border-slate-200 text-xs text-slate-400">
          <p>© {new Date().getFullYear()} DiraSchool. Built in Kenya 🇰🇪</p>
          <div className="mt-2 flex gap-4">
            <Link href="/terms" className="hover:text-slate-600 transition-colors">Terms of Service</Link>
            <Link href="/" className="hover:text-slate-600 transition-colors">Home</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
