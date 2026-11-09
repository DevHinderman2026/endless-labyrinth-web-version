// Stamps the site's version (version.json) into every page, so that browsers fetch
// a new version's files afresh instead of keeping old copies (web 3.2.0; see
// js/version.js for the whole of it). Run from the repository's folder whenever
// version.json changes:
//   node tools/stamp-version.mjs
// It changes, in every *.html page:
// - the style sheet link: css/site.css?v=<version>
// - every script tag of the site's own: js/<name>.js?v=<version>
// - the import map just before the first script, mapping every module under js/ to
//   its versioned address, so the modules the scripts import are versioned too
//   (the map is written between the two marker comments and replaced each time).
// tests/versions.mjs checks that all of this matches version.json.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const version = JSON.parse(readFileSync(join(root, 'version.json'), 'utf8')).version;
if (!/^\d+(\.\d+){1,3}$/.test(String(version || ''))) {
  console.error('version.json has no version like 3.2.0');
  process.exit(1);
}

// Every module under js/, as the page would ask for it: ./js/...
export function modules(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...modules(p));
    else if (name.endsWith('.js')) out.push('./' + relative(root, p).split(sep).join('/'));
  }
  return out;
}

export const BEGIN = '<!-- versions: written by tools/stamp-version.mjs from version.json -->';
export const END = '<!-- end of versions -->';

export function importMap(version, list) {
  const imports = Object.fromEntries(list.map((m) => [m, `${m}?v=${version}`]));
  const body = JSON.stringify({ imports }, null, 2).split('\n').map((l) => '  ' + l).join('\n');
  return `${BEGIN}\n  <script type="importmap">\n${body}\n  </script>\n  ${END}`;
}

export function stamp(html, version, list) {
  let out = html;
  // The old map, if any, comes out first (with the line it stood on).
  const a = out.indexOf(BEGIN);
  if (a >= 0) {
    const b = out.indexOf(END, a);
    const lineStart = out.lastIndexOf('\n', a) + 1;
    out = out.slice(0, lineStart) + out.slice(b + END.length + 1);
  }
  out = out.replace(/(href="css\/site\.css)(\?v=[^"]*)?"/g, `$1?v=${version}"`);
  out = out.replace(/(<script[^>]*\bsrc="js\/[^"?]+\.js)(\?v=[^"]*)?"/g, `$1?v=${version}"`);
  // The map goes in just before the first script of the page's own, indented as it is.
  const first = out.search(/<script[^>]*\bsrc="js\//);
  if (first >= 0) {
    const lineStart = out.lastIndexOf('\n', first) + 1;
    const indent = out.slice(lineStart, first);
    const map = importMap(version, list).split('\n').map((l, i) => (i === 0 ? l : indent + l.replace(/^ {2}/, ''))).join('\n');
    out = out.slice(0, lineStart) + indent + map + '\n' + out.slice(lineStart);
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('stamp-version.mjs')) {   // run, not imported
  const list = modules(join(root, 'js'));
  let changed = 0;
  for (const name of readdirSync(root).filter((n) => n.endsWith('.html')).sort()) {
    const p = join(root, name);
    const html = readFileSync(p, 'utf8');
    const out = stamp(html, version, list);
    if (out !== html) { writeFileSync(p, out); changed += 1; }
  }
  console.log(`Version ${version}: ${changed} page${changed === 1 ? '' : 's'} stamped, ${list.length} modules in the map.`);
}
