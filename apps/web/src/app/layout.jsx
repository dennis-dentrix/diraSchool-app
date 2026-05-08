import { Plus_Jakarta_Sans } from 'next/font/google';
import { Providers } from '@/providers/providers';
import 'leaflet/dist/leaflet.css';
import './globals.css';

const font = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const SITE_URL = 'https://diraschool.com';
const SITE_NAME = 'DiraSchool';
const DEFAULT_DESCRIPTION =
  'The complete CBC school management system for Kenyan schools. Digital attendance, automated fee tracking, Staff management, communication portal — all in one platform.';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — CBC School Management System`,
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
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  verification: {
    // google: 'your-google-site-verification-token',
  },

};

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${font.variable} font-sans antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema),
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
