const postcss = require('postcss');
const fs = require('fs');
const [inp, out] = process.argv.slice(2);
let css = fs.readFileSync(inp, 'utf8');
css = css.replace(/^@import\s+["']tailwindcss["'];?\s*$/m, '');
css = css.replace(/\.theme-sv002(?![\w-])/g, '.theme-sv002-lily');
css = css.replace(/url\(['"]?\.\/assets\/sv002-bg\.jpg['"]?\)/g, "url('./sv002-bg.jpg')");
css = css.replace(/url\(['"]?\.\/assets\/kiosk-bg\.png['"]?\)/g, "url('../../assets/kiosk-bg.png')");
const P = 'html.mimo2-lily';
const root = postcss.parse(css);
let n = 0;
// Drop the old global `* { margin:0; padding:0; box-sizing }` reset: Tailwind's preflight already applies it (in a
// cascade layer), and as unlayered CSS it would override every Tailwind padding/margin utility on the page.
root.walkRules(rule => { if (rule.selector.replace(/\s+/g,'') === '*,*::before,*::after') rule.remove(); });
root.walkRules(rule => {
  if (rule.parent && rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
  rule.selectors = rule.selectors.map(sel => {
    n++;
    const s = sel.trim();
    // :where() adds zero specificity, so every rule keeps exactly the weight it had when it was global CSS.
    if (/^(html|:root)\b/.test(s)) return s.replace(/^(html|:root)/, 'html:where(.mimo2-lily)');
    return `:where(${P}) ${s}`;
  });
});
const header = '/* MIMO 2.0 (SV-002) elegant white-lily theme, restored from 2e5bd172 (what machine 2 ran until 2026-11).\n   Generated: every selector is scoped to html.mimo2-lily (via :where, so specificity is unchanged) so it cannot touch CV-001 / SV-003. */\n';
fs.writeFileSync(out, header + root.toString());
console.log('scoped selectors:', n);
