import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getAllPosts } from '@/lib/blog';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';

export const metadata = {
  title: 'Blog — School Management Guides for Kenyan Schools',
  description:
    'Practical guides, success stories, and insights for Kenyan school administrators on CBC management, fee collection, and digital transformation.',
  alternates: { canonical: 'https://diraschool.com/blog' },
};

const CATEGORY_COLORS = {
  'Guides': 'bg-[#1f5b5e]/10 text-[#1f5b5e]',
  'Insights': 'bg-[#8a6020]/10 text-[#8a6020]',
  'Success Stories': 'bg-[#2d7a4f]/10 text-[#2d7a4f]',
};

function PostCard({ post }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col bg-white rounded-2xl border border-[#ddd8d0] p-7 hover:shadow-md hover:border-[#1f5b5e]/30 transition-all duration-200"
    >
      <div className="flex items-center gap-3 mb-4">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_COLORS[post.category] ?? 'bg-[#f7f5f0] text-[#5c6b60]'}`}>
          {post.category}
        </span>
        <span className="text-xs text-[#7a9080]">{post.readingTime}</span>
      </div>
      <h2 className="text-lg font-bold text-[#0d1f10] leading-snug mb-3 group-hover:text-[#1f5b5e] transition-colors">
        {post.title}
      </h2>
      <p className="text-sm text-[#4a5e50] leading-relaxed flex-1 mb-5">
        {post.description}
      </p>
      <div className="flex items-center justify-between mt-auto">
        <time className="text-xs text-[#7a9080]">
          {new Date(post.date).toLocaleDateString('en-KE', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </time>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#1f5b5e] group-hover:gap-2 transition-all">
          Read <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />

      <section className="bg-[#f7f5f0] border-b border-[#ede9e2] py-16 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-[#1f5b5e] text-xs font-bold uppercase tracking-widest mb-3">
            DiraSchool Blog
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold text-[#0d1f10] tracking-tight leading-tight">
            Guides for Kenyan school leaders
          </h1>
          <p className="mt-4 text-[#4a5e50] text-lg max-w-xl mx-auto leading-relaxed">
            Practical advice on CBC management, fee collection, digital transformation, and running a better school.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        {posts.length === 0 ? (
          <p className="text-center text-[#7a9080]">No posts yet. Check back soon.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        )}
      </section>

      <section className="bg-[#1f5b5e] py-16 px-4 sm:px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">
            Ready to modernise your school?
          </h2>
          <p className="text-white/70 mb-8">
            Join Kenyan schools already running on DiraSchool. Tell us about your school and we'll set you up within 24 hours.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-white text-[#1f5b5e] font-bold hover:bg-[#f7f5f0] transition-all shadow-lg text-sm"
          >
            Get started <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
