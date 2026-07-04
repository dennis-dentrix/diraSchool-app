import { Inter, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/providers/providers';
import './globals.css';

const fontSans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const fontDisplay = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
  display: 'swap',
});

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['500', '600'],
  display: 'swap',
});

const SITE_URL = 'https://diraschool.com';
const SITE_NAME = 'DiraSchool';
const DEFAULT_DESCRIPTION =
  'Manage your CBC school digitally. Attendance, fees, CBC report cards, and parent portal built for Kenyan schools. Free 30-day trial, no card needed.';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — CBC School Management for Kenyan Schools`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [
    'CBC school management',
    'Kenya school software',
    'CBC report cards',
    'school attendance system',
    'school fee management Kenya',
    'parent portal Kenya',
    'Competency Based Curriculum',
    'school ERP Kenya',
    'DiraSchool',
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: 'Education Technology',
  openGraph: {
    type: 'website',
    locale: 'en_KE',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — CBC School Management System`,
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'DiraSchool — CBC School Management System for Kenyan Schools',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@diraschool',
    creator: '@diraschool',
    title: `${SITE_NAME} — CBC School Management System`,
    description: DEFAULT_DESCRIPTION,
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  icons: {
    icon: [
      { url: '/icon', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/icon',
    apple: '/apple-icon',
  },
  verification: {
    // google: 'your-google-site-verification-token',
  },

};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#org`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/icon`,
        width: 512,
        height: 512,
      },
      description: 'CBC school management system for Kenyan schools.',
      address: { '@type': 'PostalAddress', addressCountry: 'KE' },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#app`,
      name: SITE_NAME,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      url: SITE_URL,
      publisher: { '@id': `${SITE_URL}/#org` },
      description: DEFAULT_DESCRIPTION,
      offers: {
        '@type': 'Offer',
        price: '12000',
        priceCurrency: 'KES',
        description: 'KES 12,000 base fee per term plus KES 55 per enrolled student, plus 16% VAT',
      },
      featureList: [
        'CBC Report Card Generation',
        'Digital Attendance Tracking',
        'Fee Management',
        'Parent Portal',
        'Staff Management',
        'Timetable Management',
        'Transport Management',
      ],
    },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable} font-sans antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd),
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
