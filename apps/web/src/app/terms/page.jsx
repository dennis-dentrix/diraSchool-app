import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service — DiraSchool',
  description: 'Terms and conditions governing use of DiraSchool, the CBC school management platform for Kenyan schools.',
  alternates: { canonical: 'https://diraschool.com/terms' },
};

const EFFECTIVE_DATE = '1 May 2025';
const CONTACT_EMAIL = 'contact@diraschool.com';

function Section({ title, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-slate-900 mb-4">{title}</h2>
      <div className="space-y-3 text-slate-600 leading-relaxed">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-slate-200 bg-white/80 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-bold text-slate-900 text-sm">← Diraschool</Link>
          <Link href="/privacy" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">Privacy Policy</Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
          <p className="text-sm text-slate-500">Effective: {EFFECTIVE_DATE}</p>
        </div>

        <p className="text-slate-600 leading-relaxed mb-10">
          Please read these Terms of Service ("Terms") carefully before using DiraSchool. By registering
          a school account or using our platform you agree to be bound by these Terms. If you do not
          agree, do not use DiraSchool.
        </p>

        <Section title="1. The Service">
          <p>
            DiraSchool is a multi-tenant, cloud-based school management platform built for Kenyan schools
            following the Competency Based Curriculum (CBC). The platform is operated by{' '}
            <strong>Dentrix Technologies</strong>, a company registered in Kenya ("DiraSchool", "we", "us").
          </p>
          <p>
            The service provides school administration features including student management, digital
            attendance, fee tracking and payment recording, CBC report card generation, staff management,
            timetable management, transport tracking, and a parent portal.
          </p>
          <p>
            We reserve the right to modify, suspend, or discontinue any part of the service with
            reasonable notice. We will not be liable to you or any third party for such changes.
          </p>
        </Section>

        <Section title="2. Eligibility and Account Registration">
          <p>
            DiraSchool is intended for use by accredited or lawfully operating Kenyan schools and their
            authorised staff. By registering, you confirm that:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>You are at least 18 years of age.</li>
            <li>You are authorised to bind your school to these Terms (e.g. you are the school principal, director, or an authorised administrator).</li>
            <li>The information you provide during registration is accurate and complete.</li>
            <li>You will keep your login credentials secure and notify us immediately of any unauthorised access.</li>
          </ul>
          <p>
            Each school is a separate tenant. One school account may have multiple users (admin, teachers,
            finance staff) with different access levels. You are responsible for the actions of all users
            under your school account.
          </p>
        </Section>

        <Section title="3. Free Trial">
          <p>
            New schools receive a <strong>30-day free trial</strong> with access to all features and
            up to 50 student records. No credit card is required to start. At the end of the trial
            period, you must subscribe to continue using the service.
          </p>
          <p>
            Trial accounts that are not converted to paid subscriptions within 60 days after the trial
            expires may have their data permanently deleted. We will email you at least 14 days before
            any data deletion.
          </p>
        </Section>

        <Section title="4. Subscription and Billing">
          <p>
            DiraSchool is billed per term (three terms per academic year). Pricing is calculated as:
          </p>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm mt-2">
            <p className="font-semibold text-slate-800">KES 8,500 base fee per term + KES 40 per enrolled student</p>
            <p className="mt-1 text-slate-500">Annual billing (3 terms paid upfront) receives a 15% discount.</p>
          </div>
          <p className="mt-3">
            Invoices are issued at the start of each term. Payment is due within 14 days of invoice.
            Accepted payment methods are M-Pesa and bank transfer. Subscriptions are non-refundable
            once a term has commenced, except where we have failed to deliver the service.
          </p>
          <p>
            We reserve the right to suspend access to the service for accounts that remain unpaid for
            more than 30 days after the due date. We will provide at least 7 days' notice before
            suspension. Suspended accounts retain their data for 90 days after suspension.
          </p>
        </Section>

        <Section title="5. Your Responsibilities">
          <p>As a school administrator or authorised user, you agree to:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>Use DiraSchool only for lawful school management purposes.</li>
            <li>Ensure that student and staff data entered into the platform is accurate.</li>
            <li>Obtain appropriate consent from parents/guardians before entering student data, consistent with the Kenya Data Protection Act, 2019.</li>
            <li>Not share login credentials between users — each user must have their own account.</li>
            <li>Not attempt to reverse-engineer, scrape, or exploit the platform.</li>
            <li>Not upload or transmit malicious code, spam, or illegal content.</li>
            <li>Maintain appropriate internal policies for who within your school may access which data.</li>
          </ul>
        </Section>

        <Section title="6. Prohibited Uses">
          <p>You may not use DiraSchool to:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>Harass, threaten, or harm any student, parent, or staff member.</li>
            <li>Engage in any fraudulent activity including falsifying academic records.</li>
            <li>Circumvent multi-tenant isolation to access another school's data.</li>
            <li>Conduct automated bulk scraping of data without our written consent.</li>
            <li>Resell or sublicense access to DiraSchool without our written permission.</li>
            <li>Use the service in any way that violates Kenyan law or regulation.</li>
          </ul>
          <p>
            Violation of these terms may result in immediate account suspension without refund.
          </p>
        </Section>

        <Section title="7. Data Ownership and Portability">
          <p>
            <strong>You own your school's data.</strong> DiraSchool processes data on your behalf as a
            data processor. We do not claim ownership over student records, academic data, or financial
            data you enter into the platform.
          </p>
          <p>
            You may export your data at any time from within the platform (CSV export is available for
            payments, attendance, students, and results). Upon account closure, you may request a full
            data export within 30 days. After 30 days, your data is subject to our retention and deletion
            policy as described in our Privacy Policy.
          </p>
        </Section>

        <Section title="8. Intellectual Property">
          <p>
            DiraSchool and all its underlying software, design, trademarks, and content are the
            intellectual property of Dentrix Technologies. These Terms do not grant you any rights
            to use our branding or intellectual property beyond what is needed to use the service.
          </p>
          <p>
            You grant us a limited licence to process your school's data solely for the purpose of
            delivering the service to you.
          </p>
        </Section>

        <Section title="9. Availability and Service Levels">
          <p>
            We aim to maintain 99.5% monthly uptime. Planned maintenance will be communicated at least
            24 hours in advance. We are not liable for downtime caused by factors outside our reasonable
            control including internet outages, force majeure, or third-party provider failures.
          </p>
          <p>
            We provide best-effort support via email at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">{CONTACT_EMAIL}</a>.
            Support is available Monday–Friday, 8 am – 6 pm East Africa Time.
          </p>
        </Section>

        <Section title="10. Disclaimer of Warranties">
          <p>
            DiraSchool is provided "as is" and "as available". To the fullest extent permitted by Kenyan
            law, we disclaim all warranties, express or implied, including fitness for a particular
            purpose, merchantability, and non-infringement.
          </p>
          <p>
            We do not warrant that the service will be error-free, uninterrupted, or free of viruses.
            You are responsible for maintaining backups of critical data. CSV exports are provided for
            this purpose.
          </p>
        </Section>

        <Section title="11. Limitation of Liability">
          <p>
            To the maximum extent permitted by law, DiraSchool's total liability to you for any claim
            arising from these Terms or use of the service shall not exceed the amount you paid us in
            the 3 months preceding the claim.
          </p>
          <p>
            We are not liable for any indirect, incidental, special, or consequential damages including
            loss of data, loss of revenue, or reputational harm, even if we have been advised of the
            possibility of such damages.
          </p>
        </Section>

        <Section title="12. Termination">
          <p>
            You may cancel your subscription at any time from the Billing section of your dashboard or
            by emailing{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">{CONTACT_EMAIL}</a>.
            Cancellation takes effect at the end of the current billing term. No partial refunds are
            issued for early cancellation.
          </p>
          <p>
            We may terminate your account immediately and without notice if you materially breach these
            Terms, fail to pay invoices for more than 60 days, or engage in any prohibited conduct.
          </p>
        </Section>

        <Section title="13. Changes to These Terms">
          <p>
            We may update these Terms from time to time to reflect changes in our service or applicable
            law. We will notify all school administrators by email at least 14 days before material
            changes take effect. Your continued use of DiraSchool after the effective date constitutes
            acceptance of the revised Terms.
          </p>
          <p>
            The current version of these Terms is always available at{' '}
            <a href="https://diraschool.com/terms" className="text-blue-600 hover:underline">diraschool.com/terms</a>.
          </p>
        </Section>

        <Section title="14. Governing Law and Disputes">
          <p>
            These Terms are governed by the laws of the <strong>Republic of Kenya</strong>. Any dispute
            arising from or related to these Terms or your use of DiraSchool shall be resolved through
            good-faith negotiation. If negotiation fails, disputes shall be referred to the courts of
            competent jurisdiction in Nairobi, Kenya.
          </p>
        </Section>

        <Section title="15. Contact">
          <p>For questions about these Terms:</p>
          <div className="mt-3 p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm space-y-1">
            <p><strong>DiraSchool</strong></p>
            <p>
              Email:{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">{CONTACT_EMAIL}</a>
            </p>
            <p>Website: <a href="https://diraschool.com" className="text-blue-600 hover:underline">diraschool.com</a></p>
            <p>Country: Kenya</p>
          </div>
        </Section>

        <div className="pt-6 border-t border-slate-200 text-xs text-slate-400">
          <p>© {new Date().getFullYear()} DiraSchool. Built in Kenya 🇰🇪</p>
          <div className="mt-2 flex gap-4">
            <Link href="/privacy" className="hover:text-slate-600 transition-colors">Privacy Policy</Link>
            <Link href="/" className="hover:text-slate-600 transition-colors">Home</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
