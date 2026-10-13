// Build the static website into site/dist from site/src, the catalog and the screenshots.
//
//   node site/build.mjs                    # uses SITE_URL or the default below
//   SITE_URL=https://example.com node site/build.mjs
//
// Deploy site/dist to any static host (Cloudflare Pages: `npx wrangler pages deploy site/dist`).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const src = path.join(here, 'src');
const dist = path.join(here, 'dist');
const SITE = (process.env.SITE_URL || 'https://loadout-skills.pages.dev').replace(/\/$/, '');

// Read config.js the way the browser does, to get the repo and ad settings.
const cfgCtx = { window: {} };
vm.runInNewContext(await fs.readFile(path.join(src, 'config.js'), 'utf8'), cfgCtx);
const cfg = cfgCtx.window.LOADOUT_SITE;
const adsOn = /^ca-pub-\d{10,20}$/.test(cfg.adsenseClient) && /^\d{6,12}$/.test(cfg.adsenseSlot);

const catalog = JSON.parse(await fs.readFile(path.join(root, 'catalog', 'catalog.json'), 'utf8'));
const community = new Set(catalog.skills.filter((s) => s.tier === 'community').map((s) => s.repo)).size;
const scanned = 160;

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(path.join(dist, 'fonts'), { recursive: true });
await fs.mkdir(path.join(dist, 'img'), { recursive: true });

const header = await fs.readFile(path.join(src, '_header.html'), 'utf8');
const footer = await fs.readFile(path.join(src, '_footer.html'), 'utf8');
const date = new Date().toISOString().slice(0, 10);
const adsParagraph = adsOn
  ? 'The catalog page shows one ad, served by Google AdSense, under the skill details. Google may use cookies to serve and measure it; in the EEA, UK and Switzerland you are asked first. See <a href="https://policies.google.com/technologies/ads">how Google uses information from sites that use its services</a>. You can turn off personalized ads at <a href="https://adssettings.google.com">adssettings.google.com</a>.'
  : 'The site shows no ads and loads nothing from advertising services.';
const fill = (html, page) => html
  .replace('{{HEADER}}', header.replace(`data-page="${page}"`, `data-page="${page}" aria-current="page"`))
  .replace('{{FOOTER}}', footer)
  .replaceAll('{{REPO}}', cfg.repo)
  .replaceAll('{{SITE}}', SITE)
  .replaceAll('{{SKILLS}}', catalog.skills.length.toLocaleString('en-US'))
  .replaceAll('{{REPOS}}', String(community))
  .replaceAll('{{SCANNED}}', String(scanned))
  .replaceAll('{{DATE}}', date)
  .replaceAll('{{ADS_PARAGRAPH}}', adsParagraph);

for (const f of await fs.readdir(src)) {
  if (f.startsWith('_') || f === 'img') continue;
  const from = path.join(src, f);
  if (f.endsWith('.html')) await fs.writeFile(path.join(dist, f), fill(await fs.readFile(from, 'utf8'), f.replace('.html', '')));
  else await fs.copyFile(from, path.join(dist, f));
}

// Fonts (OFL), screenshots and icon.
const fonts = [
  ['@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2'],
  ['@fontsource-variable/archivo/files/archivo-latin-ext-wdth-normal.woff2'],
  ['@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'],
  ['@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2'],
];
for (const [f] of fonts) await fs.copyFile(path.join(root, 'node_modules', f), path.join(dist, 'fonts', path.basename(f)));
await fs.copyFile(path.join(root, 'node_modules/@fontsource-variable/archivo/LICENSE'), path.join(dist, 'fonts', 'Archivo-OFL.txt'));
await fs.copyFile(path.join(root, 'node_modules/@fontsource/ibm-plex-mono/LICENSE'), path.join(dist, 'fonts', 'IBM-Plex-Mono-OFL.txt'));
for (const f of ['screenshot-light.png', 'screenshot-dark.png']) await fs.copyFile(path.join(root, 'docs', f), path.join(dist, 'img', f));
await fs.copyFile(path.join(root, 'build', 'icon.png'), path.join(dist, 'img', 'icon.png'));
for (const f of await fs.readdir(path.join(src, 'img')).catch(() => [])) await fs.copyFile(path.join(src, 'img', f), path.join(dist, 'img', f));

// Catalog data, compact keys (see catalog.js).
const data = catalog.skills.map((s) => ({
  k: `${s.repo}:${s.path}`, id: s.id, t: s.tier === 'anthropic' ? 'a' : 'c', kind: s.kind, b: s.blurb,
  d: s.description.slice(0, 1536), tok: s.tok, f: s.files, x: s.scripts, by: s.bytes, tr: s.tree,
  r: s.repo, p: s.path, ref: s.ref, w: s.warnings,
}));
await fs.writeFile(path.join(dist, 'catalog-data.json'), JSON.stringify(data));

// Search engines, the host's headers, and ads.txt only when ads are on.
await fs.writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
await fs.writeFile(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['', 'catalog.html', 'guides.html', 'guide-context.html', 'guide-safety.html', 'audit.html', 'privacy.html'].map((p) => `  <url><loc>${SITE}/${p}</loc><lastmod>${date}</lastmod></url>`).join('\n')}\n</urlset>\n`);
const adHosts = adsOn ? ' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.gstatic.com https://*.adtrafficquality.google' : '';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'sha256-${'{{LDJSON}}'}'${adHosts}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data:${adHosts}`,
  "font-src 'self'",
  `connect-src 'self'${adHosts}`,
  `frame-src${adsOn ? adHosts : " 'none'"}`,
  "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join('; ');
// Hash the one inline script (JSON-LD) so the CSP can allow exactly it.
const { createHash } = await import('node:crypto');
const index = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
const ld = index.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
const ldHash = createHash('sha256').update(ld).digest('base64');
await fs.writeFile(path.join(dist, '_headers'), `/*\n  Content-Security-Policy: ${csp.replace('{{LDJSON}}', ldHash)}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n`);
if (adsOn) await fs.writeFile(path.join(dist, 'ads.txt'), `google.com, ${cfg.adsenseClient.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`);

console.log(`site built: ${path.relative(root, dist)} (${data.length} skills, ads ${adsOn ? 'on' : 'off'}, site ${SITE})`);
