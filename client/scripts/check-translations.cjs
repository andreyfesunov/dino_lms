const fs = require('node:fs');
const path = require('node:path');
const { FluentBundle, FluentResource } = require('@fluent/bundle');

const root = path.resolve(__dirname, '..');
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? files(name) : [name];
  });
}
const used = new Set([
  'role-admin',
  'role-teacher',
  'role-student',
  'status-active',
  'status-pending',
]);
for (const file of files(path.join(root, 'src')).filter(
  (file) => /\.(ts|html)$/.test(file) && !file.endsWith('.spec.ts'),
)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\b(?:t|format|formatPattern)\(\s*['"]([^'"]+)['"]/g)) {
    if (!match[1].endsWith('-')) used.add(match[1]);
  }
}
const catalogs = ['en', 'ru'].map((locale) => {
  const source = fs.readFileSync(path.join(root, 'public/locales', locale + '.ftl'), 'utf8');
  const bundle = new FluentBundle(locale);
  const errors = bundle.addResource(new FluentResource(source));
  if (errors.length) throw new Error(`${locale}: ${errors.join(', ')}`);
  return {
    locale,
    bundle,
    keys: new Set([...source.matchAll(/^([a-z][a-z0-9-]*)\s*=/gm)].map((match) => match[1])),
  };
});
let failed = false;
for (const { locale, bundle, keys } of catalogs) {
  const missing = [
    ...new Set([...used, ...catalogs.flatMap((catalog) => [...catalog.keys])]),
  ].filter((key) => !keys.has(key) || !bundle.getMessage(key)?.value);
  if (missing.length) {
    console.error(`${locale}: missing ${missing.sort().join(', ')}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log(`Translations: ${used.size} referenced keys present in EN and RU; catalogs match.`);
