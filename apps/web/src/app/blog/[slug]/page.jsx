import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Clock, Calendar } from 'lucide-react';
import { getPostBySlug, getAllSlugs } from '@/lib/blog';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `https://diraschool.com/blog/${slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `https://diraschool.com/blog/${slug}`,
      type: 'article',
      publishedTime: post.date,
    },
  };
}

const CATEGORY_COLORS = {
  'Guides': 'bg-[#1f5b5e]/10 text-[#1f5b5e]',
  'Insights': 'bg-[#8a6020]/10 text-[#8a6020]',
  'Success Stories': 'bg-[#2d7a4f]/10 text-[#2d7a4f]',
};

export default async function BlogArticlePage({ params }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    publisher: {
      '@type': 'Organization',
      name: 'DiraSchool',
      url: 'https://diraschool.com',
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://diraschool.com/blog/${slug}`,
    },
  };

  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNav />

      {/* Article header */}
      <header className="bg-[#f7f5f0] border-b border-[#ede9e2] pt-12 pb-14 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-[#5c6b60] hover:text-[#1f5b5e] transition-colors mb-8"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All articles
          </Link>

          <div className="flex items-center gap-3 mb-5">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_COLORS[post.category] ?? 'bg-[#f7f5f0] text-[#5c6b60]'}`}>
              {post.category}
            </span>
            <span className="flex items-center gap-1 text-xs text-[#7a9080]">
              <Clock className="h-3 w-3" /> {post.readingTime}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#0d1f10] tracking-tight leading-tight mb-5">
            {post.title}
          </h1>

          <p className="text-lg text-[#4a5e50] leading-relaxed mb-6 max-w-2xl">
            {post.description}
          </p>

          <div className="flex items-center gap-1.5 text-xs text-[#7a9080]">
            <Calendar className="h-3 w-3" />
            <time dateTime={post.date}>
              {new Date(post.date).toLocaleDateString('en-KE', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </time>
          </div>
        </div>
      </header>

      {/* Article body */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
        <div
          className="prose prose-lg max-w-none
            prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-[#0d1f10]
            prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4
            prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
            prose-p:text-[#4a5e50] prose-p:leading-relaxed prose-p:mb-5
            prose-a:text-[#1f5b5e] prose-a:font-semibold prose-a:no-underline hover:prose-a:underline
            prose-strong:text-[#0d1f10] prose-strong:font-semibold
            prose-ul:text-[#4a5e50] prose-ol:text-[#4a5e50]
            prose-li:mb-1.5
            prose-blockquote:border-l-[#1f5b5e] prose-blockquote:bg-[#f7f5f0] prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:not-italic
            prose-blockquote:text-[#4a5e50]
            prose-hr:border-[#ddd8d0] prose-hr:my-10
            prose-table:text-sm
            prose-th:text-[#0d1f10] prose-th:bg-[#f7f5f0] prose-th:font-semibold
            prose-td:text-[#4a5e50]
            prose-code:text-[#1f5b5e] prose-code:bg-[#f7f5f0] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />
      </main>

      {/* CTA strip */}
      <section className="bg-[#f7f5f0] border-t border-[#ede9e2] py-16 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <p className="text-[#1f5b5e] text-xs font-bold uppercase tracking-widest mb-1">DiraSchool</p>
            <h2 className="text-xl sm:text-2xl font-bold text-[#0d1f10] tracking-tight">
              Ready to see it in action?
            </h2>
            <p className="text-sm text-[#4a5e50] mt-1">
              30-day free trial. No credit card. Full CBC compliance.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#1f5b5e] hover:bg-[#1a4e51] text-white font-semibold text-sm shadow-md transition-all"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="mailto:admin@diraschool.com"
              className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-[#ddd8d0] text-[#1f5b5e] font-medium text-sm hover:bg-white transition-all"
            >
              Email us
            </a>
          </div>
        </div>
      </section>

      {/* Back to blog */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm text-[#5c6b60] hover:text-[#1f5b5e] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to all articles
        </Link>
      </div>

      <MarketingFooter />
    </div>
  );
}
