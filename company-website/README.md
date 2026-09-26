# `company-website/` — old static company site (stale)

**Responsibility:** a copy of the static marketing pages (landing, about, blog, legal pages, sitemap) from an earlier stage. **It is not what production serves.**
The live pages are in [`mimo-website/public/`](../mimo-website/public/README.md) (served by Vercel at `printmimo.tech`). The two copies have diverged (this one has extra `privacy-policy.html` / `terms-of-service.html`; the live one has more images).

| Path | Purpose |
|---|---|
| `*.html`, `blog/`, `Brands/`, `fonts/` | Static pages and assets |
| `sitemap.xml`, `robots.txt`, `ads.txt`, `mimo_graph.pdf` | SEO / AdSense / a diagram |

No build, no dependencies, no environment variables, no tests. Open the HTML files directly in a browser.
**Recommendation:** treat as an archive; make edits in `mimo-website/public/` instead, and remove this folder once nobody needs it.
Related: [`docs/README.md`](../docs/README.md).
