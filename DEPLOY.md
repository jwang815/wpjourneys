# Deployment

The site is currently served by **GitHub Pages** from the `main` branch
of `jwang815/jwang815.github.io`, with `wpjourneys.com` set as the custom
domain via the `CNAME` file.

A `vercel.json` is committed at the repo root so the same `main` branch
can also be deployed to Vercel for zero-config previews + auto-deploys.

## Move production from GitHub Pages → Vercel

One-time setup, ~5 minutes:

1. **Create the Vercel project**
   - Go to https://vercel.com/new and import `jwang815/jwang815.github.io`.
   - Framework preset: *Other* (it's a static site — Vercel will serve
     the repo files directly using `vercel.json`). No build command.
   - Production branch: `main`.

2. **Add the custom domain**
   - In *Project Settings → Domains*, add `wpjourneys.com` and
     `www.wpjourneys.com`.
   - Vercel will show you the DNS records to set.

3. **Update DNS** (at your registrar / DNS provider for `wpjourneys.com`)
   - Replace the apex `A` records that currently point at GitHub Pages
     (185.199.108–111.153) with Vercel's `A` record `76.76.21.21`
     **OR** an `ALIAS`/`ANAME` to `cname.vercel-dns.com`.
   - Replace the `CNAME` for `www` with `cname.vercel-dns.com`.
   - Wait for DNS to propagate (usually a few minutes; up to 24h).

4. **Disable GitHub Pages**
   - In the GitHub repo: *Settings → Pages → Source → None*.
   - This avoids the two systems fighting over the custom domain.
   - The repo's `CNAME` file can be left in place — Vercel ignores it.

5. **Verify**
   - Push any commit to `main`. Vercel auto-deploys.
   - Pull-request commits get preview URLs automatically.

## What `vercel.json` configures

- **`cleanUrls`** + **`trailingSlash: true`** → matches the existing
  GitHub Pages URL structure: `/blog/`, `/about/`, `/socotra/`, etc.
- **301 redirects** for the legacy meta-refresh stub paths
  (`/home/`, `/contact/`, `/socotra-expedition/`) so SEO is preserved.
- **Cache headers**: 1 year `immutable` for images, 1 day for CSS / JS /
  translation files, default for HTML (so updates are picked up fast).
- **Security headers**: `X-Content-Type-Options`, `Strict-Transport-
  Security`, `Referrer-Policy`, `Permissions-Policy`.

## Reverting

If anything goes wrong: just re-enable GitHub Pages (Settings → Pages →
Source: `main` / `/`) and put DNS back to the GitHub Pages IPs. The repo
content is identical between hosts, so swapping is non-destructive.
