// Shared translations for blog pages (nav, footer, common UI).
// Per-post translation files extend window.__i18n via Object.assign so they
// can layer on top of these shared keys without overwriting them.
window.__i18n = Object.assign(window.__i18n || {}, {
  "blog_nav_home": {
    "en": "Home",
    "zh": "首页"
  },
  "blog_nav_blog": {
    "en": "Blog",
    "zh": "博客"
  },
  "blog_nav_about": {
    "en": "About Us",
    "zh": "关于我们"
  },
  "blog_nav_inquire": {
    "en": "Inquire",
    "zh": "咨询预订"
  },
  "blog_footer_copy": {
    "en": "&copy; 2026 <a href=\"/\">Waypoint Journeys</a>. Where the map ends, the journey begins.",
    "zh": "&copy; 2026 <a href=\"/\">Waypoint Journeys</a>。地图终止之处，正是旅程的起点。"
  },
  "blog_filter_all": {
    "en": "All",
    "zh": "全部"
  },
  "blog_filter_company": {
    "en": "Company",
    "zh": "公司"
  },
  "blog_filter_destinations": {
    "en": "Destinations",
    "zh": "目的地"
  },
  "blog_filter_planning": {
    "en": "Planning",
    "zh": "行前规划"
  },
  "blog_index_hero_title": {
    "en": "The Journal",
    "zh": "旅行手记"
  },
  "blog_index_hero_subtitle": {
    "en": "Guides, stories, and insights from the places where the map ends.",
    "zh": "在地图终止之处，关于那些地方的指南、故事与思考。"
  },
  "blog_category_company": {
    "en": "Company",
    "zh": "公司"
  },
  "blog_category_destinations": {
    "en": "Destinations",
    "zh": "目的地"
  },
  "blog_category_planning": {
    "en": "Planning",
    "zh": "行前规划"
  },
  "blog_meta_min_read": {
    "en": "min read",
    "zh": "分钟阅读"
  }
});
