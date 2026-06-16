import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { marked } from 'marked';

const CONTENT_DIR = path.join(process.cwd(), 'src/content/blog');

marked.use({ gfm: true, breaks: false });

export function getAllPosts() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
  return files
    .map((filename) => {
      const slug = filename.replace(/\.md$/, '');
      const raw = fs.readFileSync(path.join(CONTENT_DIR, filename), 'utf8');
      const { data } = matter(raw);
      return { slug, ...data };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function getPostBySlug(slug) {
  const filePath = path.join(CONTENT_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(raw);
  return { slug, ...data, content: marked.parse(content) };
}

export function getAllSlugs() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
}
