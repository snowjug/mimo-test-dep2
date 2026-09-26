# `mimo-website/public/` — static marketing site

**Responsibility:** the plain-HTML pages served by Vercel: landing page (`/` and `/landing`), about, contact, blog, legal pages (privacy, terms, cookie and refund policy), plus `sitemap.xml`, `robots.txt` and `ads.txt` (Google AdSense). It is independent of the React app.

| Path | Purpose |
|---|---|
| `index.html`, `about.html`, `contact.html`, `blog.html`, `blog/` | Marketing content |
| `privacy.html`, `terms.html`, `cookie-policy.html`, `refund-policy.html` | Legal pages |
| `images/`, `Brands/`, `fonts/`, `*.png`, `*.jpg` | Assets |
| `sitemap.xml`, `robots.txt`, `ads.txt`, `google…html` | SEO / AdSense / Search Console verification — do not delete |

URL routing (`/privacy` → `/privacy.html`, `/blog/:slug`) is defined in `../vercel.json`. No build step, dependencies or tests: edit the HTML, run `npm run dev` in `mimo-website/` and open the page, or open the file in a browser. Vite copies this folder into the build output.
The older copy in [`../../company-website/`](../../company-website/README.md) is stale — edit here.
