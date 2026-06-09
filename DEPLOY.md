# Deployment

**Production: Vercel.** The `wpjourneys` Vercel project (team
`jwang815s-projects`) serves `wpjourneys.com` and `www.wpjourneys.com`,
deploying automatically from the `main` branch of
`github.com/jwang815/wpjourneys`. Every push to any other branch gets a
preview URL automatically.

GitHub Pages (the original host, when this repo was the
`jwang815.github.io` user site) is **decommissioned** — the Pages
workflow, `CNAME`, and `.nojekyll` files were removed when the repo
moved to `jwang815/wpjourneys`. If GitHub Pages is still enabled in the
repo settings, turn it off: *Settings → Pages → Source → None*.

## How a change ships

1. Open a PR / push a branch → Vercel builds a preview deployment
   (`wpjourneys-git-<branch>-jwang815s-projects.vercel.app`).
2. Merge to `main` → Vercel deploys to production and flips
   `wpjourneys.com` to it atomically. Rollback is instant from the
   Vercel dashboard (*Deployments → ⋯ → Promote to Production* on any
   previous deployment).

## What `vercel.json` configures

- **`cleanUrls`** + **`trailingSlash: true`** → URL structure:
  `/blog/`, `/about/`, `/socotra/`, etc.
- **301 redirects** for legacy stub paths (`/home/`, `/contact/`,
  `/socotra-expedition/`) and `www.wpjourneys.com` → apex, so SEO is
  preserved.
- **Cache headers**: 1 year `immutable` for images, 1 day for CSS / JS /
  translation files, default for HTML (so updates are picked up fast).
- **Security headers**: `X-Content-Type-Options`, `Strict-Transport-
  Security`, `Referrer-Policy`, `Permissions-Policy`.
- **Cron**: `/api/daily-brief` daily at 13:00 UTC.

## DNS (for reference)

`wpjourneys.com` apex → Vercel (`A 76.76.21.21` or ALIAS to
`cname.vercel-dns.com`); `www` → `cname.vercel-dns.com`. Managed at the
domain registrar.

## Reverting / disaster recovery

- **Bad deploy** → promote a previous deployment in the Vercel
  dashboard (no git work needed).
- **Vercel outage / leaving Vercel** → the site is fully static; any
  static host can serve the repo root as-is. For GitHub Pages
  specifically: re-add a `CNAME` file containing `wpjourneys.com`, add
  an empty `.nojekyll`, enable Pages on `main`, and point DNS back to
  the GitHub Pages IPs (185.199.108–111.153).
