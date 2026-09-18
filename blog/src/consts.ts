// Everything the templates need to stay bilingual lives here, so adding a
// string never means editing five .astro files.
export const SITE = {
  domain: 'blog.qike.ccwu.cc',
  // Filled in once AdSense approves the site; left empty the ad slots render
  // nothing rather than a broken script tag.
  adsenseClient: '' // e.g. 'ca-pub-XXXXXXXXXXXXXXXX'
};

export const LANGS = ['zh', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export const CATEGORIES = ['monetize', 'tools', 'ai'] as const;
export type Category = (typeof CATEGORIES)[number];

export const UI: Record<Lang, {
  siteName: string;
  tagline: string;
  nav: { home: string; about: string };
  categories: Record<Category, string>;
  readMore: string;
  postedOn: string;
  updatedOn: string;
  otherLang: string;
  otherLangCode: Lang;
  allPosts: string;
  privacy: string;
  backHome: string;
  ctaTitle: string;
  ctaText: string;
  ctaButton: string;
}> = {
  zh: {
    siteName: 'Qike 笔记',
    tagline: '内容创作、平台运营与 AI 工具的实用笔记',
    nav: { home: '首页', about: '关于' },
    categories: { monetize: '运营变现', tools: '工具教程', ai: 'AI 科普' },
    readMore: '阅读全文',
    postedOn: '发布于',
    updatedOn: '更新于',
    otherLang: 'English',
    otherLangCode: 'en',
    allPosts: '全部文章',
    privacy: '隐私政策',
    backHome: '← 返回首页',
    ctaTitle: '需要一个干净的视频下载工具？',
    ctaText: 'NovaPull 是一款隐私优先、无广告的 Windows 视频下载器，解析和下载都在本机完成。',
    ctaButton: '了解 NovaPull →'
  },
  en: {
    siteName: 'Qike Notes',
    tagline: 'Practical notes on content, platform growth and AI tools',
    nav: { home: 'Home', about: 'About' },
    categories: { monetize: 'Growth & Income', tools: 'Tools & How-to', ai: 'AI Explained' },
    readMore: 'Read more',
    postedOn: 'Posted',
    updatedOn: 'Updated',
    otherLang: '中文',
    otherLangCode: 'zh',
    allPosts: 'All posts',
    privacy: 'Privacy Policy',
    backHome: '← Back home',
    ctaTitle: 'Want a clean video downloader?',
    ctaText: 'NovaPull is a privacy-first, ad-free Windows video downloader — parsing and downloading happen entirely on your own machine.',
    ctaButton: 'Meet NovaPull →'
  }
};

export const NOVAPULL_SITE = 'https://www.qike.ccwu.cc/';
