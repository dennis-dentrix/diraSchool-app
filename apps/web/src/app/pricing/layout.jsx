export const metadata = {
  title: 'Pricing — DiraSchool CBC School Management System',
  description:
    'Per-term pricing for Kenyan CBC schools. KES 12,000 base + KES 55 per student per term. Full CBC features, no hidden fees. Free 30-day trial.',
  openGraph: {
    title: 'DiraSchool Pricing — Fair, Transparent & CBC-Aligned',
    description:
      'KES 12,000 base + KES 55 per student per term + 16% VAT. Annual billing saves 10%. Calculate your exact price instantly.',
    url: 'https://diraschool.com/pricing',
  },
  alternates: { canonical: 'https://diraschool.com/pricing' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'DiraSchool Pricing',
  url: 'https://diraschool.com/pricing',
  description: 'Pricing plans for DiraSchool CBC school management system for Kenyan schools.',
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'DiraSchool',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    url: 'https://diraschool.com',
    offers: [
      {
        '@type': 'Offer',
        name: 'Starter — 100 to 250 students',
        price: '20300',
        priceCurrency: 'KES',
        description: 'KES 12,000/term base fee + KES 55 per student + 16% VAT. Full CBC features for emerging schools.',
      },
      {
        '@type': 'Offer',
        name: 'Growth — 250 to 600 students',
        price: '30160',
        priceCurrency: 'KES',
        description: 'KES 12,000/term base fee + KES 55 per student + 16% VAT. Most popular plan for expanding Kenyan schools.',
      },
      {
        '@type': 'Offer',
        name: 'Pro — 600+ students',
        price: '52200',
        priceCurrency: 'KES',
        description: 'KES 12,000/term base fee + KES 55 per student + 16% VAT. Priority support and advanced analytics for large schools.',
      },
    ],
  },
};

export default function PricingLayout({ children }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
