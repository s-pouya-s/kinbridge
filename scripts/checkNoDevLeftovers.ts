/**
 * Fails when anything from development is left in what gets committed and
 * built: debug code, the Expo dev client, dev-server addresses, test ads
 * switched on, a package.json rewritten by `expo prebuild`, or files that
 * must never be tracked. Runs in `check:all`, so before every commit and in
 * the release pipeline. See AGENTS.md, "No development leftovers".
 */
// Plain require with small types, like the other checks (the project has no Node types).
const fs = require('fs') as {
  readdirSync(p: string): string[];
  readFileSync(p: string, e: string): string;
  statSync(p: string): { isDirectory(): boolean };
};
const { execSync } = require('child_process') as {
  execSync(cmd: string, opts: { encoding: string; stdio: string[] }): string;
};

// npm runs checks from the project root.
const read = (p: string) => fs.readFileSync(p, 'utf8');
let failures = 0;
const fail = (msg: string) => {
  console.error('FAIL:', msg);
  failures++;
};
const ok = (msg: string) => console.log(`ok  : ${msg}`);

// ---- App code: App.tsx, index.ts and everything under src/.
function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((name: string) => {
    const p = `${dir}/${name}`;
    return fs.statSync(p).isDirectory() ? filesUnder(p) : /\.(ts|tsx|js|jsx)$/.test(name) ? [p] : [];
  });
}
const appFiles = ['App.tsx', 'index.ts', ...filesUnder('src')];

/** The code without comments, so explaining a past dev-only problem in a comment is fine. */
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const codeRules: { name: string; pattern: RegExp }[] = [
  { name: 'console.log / console.debug / console.info (debug output)', pattern: /\bconsole\.(log|debug|info|trace)\s*\(/ },
  { name: 'a debugger statement', pattern: /\bdebugger\s*;?/ },
  { name: 'an import of the Expo dev client or dev menu', pattern: /(from|require\(|import\()\s*['"]expo-dev-(client|menu|launcher)/ },
  { name: 'a dev-server address (localhost, exp://, tunnel, port 8081, raw IP)', pattern: /localhost|127\.0\.0\.1|exp:\/\/|\.exp\.direct|ngrok|:8081\b|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+/ },
  { name: '__DEV__ being set by hand', pattern: /\b__DEV__\s*=[^=]/ },
  { name: 'test ads switched on by hand', pattern: /useTestAds\s*=\s*true|EXPO_PUBLIC_ADS_TEST\s*=\s*['"]1['"]/ },
  { name: 'an import from local/ (the owner\'s real family)', pattern: /(from|require\()\s*['"][./]*local\// },
];
let codeClean = true;
for (const file of appFiles) {
  const lines = withoutComments(read(file)).split('\n');
  lines.forEach((line, i) => {
    for (const rule of codeRules) {
      if (rule.pattern.test(line)) {
        fail(`${file}:${i + 1} has ${rule.name}: ${line.trim().slice(0, 100)}`);
        codeClean = false;
      }
    }
  });
}
if (codeClean) ok(`no debug code, dev client, dev-server address or hand-set test ads in ${appFiles.length} app files`);

// Test ads come on only through the one allowed switch (AGENTS.md, Ads).
const ads = withoutComments(read('src/ads/launchInterstitial.ts'));
if (!/const useTestAds = __DEV__ \|\| process\.env\.EXPO_PUBLIC_ADS_TEST === '1';/.test(ads)) {
  fail("src/ads/launchInterstitial.ts must decide test ads with exactly: const useTestAds = __DEV__ || process.env.EXPO_PUBLIC_ADS_TEST === '1';");
} else ok('test ads only through __DEV__ or EXPO_PUBLIC_ADS_TEST=1');

// ---- eas.json: store builds are clean; preview builds keep test ads.
const eas = JSON.parse(read('eas.json'));
const profiles: Record<string, { developmentClient?: boolean; distribution?: string; env?: Record<string, string>; extends?: string }> = eas.build ?? {};
const envOf = (name: string): Record<string, string> => {
  const p = profiles[name];
  if (!p) return {};
  return { ...(p.extends ? envOf(p.extends) : {}), ...(p.env ?? {}) };
};
let easClean = true;
for (const name of Object.keys(profiles).filter((n) => n.startsWith('production'))) {
  const p = profiles[name];
  if (p.developmentClient) (fail(`eas.json: store profile "${name}" has developmentClient`), (easClean = false));
  if (p.distribution === 'internal') (fail(`eas.json: store profile "${name}" is internal distribution`), (easClean = false));
  if (envOf(name).EXPO_PUBLIC_ADS_TEST) (fail(`eas.json: store profile "${name}" sets EXPO_PUBLIC_ADS_TEST (test ads in a store build)`), (easClean = false));
}
for (const name of Object.keys(profiles).filter((n) => n.startsWith('preview'))) {
  if (envOf(name).EXPO_PUBLIC_ADS_TEST !== '1') (fail(`eas.json: preview profile "${name}" must set EXPO_PUBLIC_ADS_TEST=1 (preview APKs are release builds)`), (easClean = false));
}
if (easClean) ok('eas.json: store profiles have no dev client or test ads; preview profiles keep test ads');

// ---- app.json: no dev client plugin.
const appJson = read('app.json');
if (/expo-dev-(client|menu|launcher)/.test(appJson)) fail('app.json mentions the Expo dev client');
else ok('app.json: no dev client plugin');

// ---- package.json: expo prebuild rewrites these; never commit that.
const scripts = JSON.parse(read('package.json')).scripts ?? {};
if (scripts.android !== 'expo start --android' || scripts.ios !== 'expo start --ios') {
  fail(`package.json "android"/"ios" scripts were rewritten (by expo prebuild?): "${scripts.android}", "${scripts.ios}". Put back "expo start --android" / "expo start --ios".`);
} else ok('package.json: android/ios scripts not rewritten by prebuild');

// ---- Release builds must drop the dev client.
const workflow = read('.github/workflows/release-builds.yml');
if (!workflow.includes('npm uninstall --no-save expo-dev-client')) fail('release-builds.yml no longer removes expo-dev-client before building');
else ok('release builds remove the dev client');

// ---- Files that must never be tracked (staged files count: this runs before each commit).
let tracked: string[] | null = null;
try {
  tracked = execSync('git ls-files', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
} catch {
  console.log('skip: not a git checkout, tracked files not checked');
}
if (tracked) {
  const forbidden = tracked.filter(
    (f) => /^(android|ios|local|\.expo)\//.test(f) || /(^|\/)\.ssh-key$/.test(f) || /\.(jks|keystore|p12|pk8|bin|log)$/.test(f) || /(^|\/)\.env(\.|$)/.test(f)
  );
  if (forbidden.length) fail(`these must not be tracked: ${forbidden.slice(0, 10).join(', ')}${forbidden.length > 10 ? ' …' : ''}`);
  else ok(`no android/, ios/, local/, keys, .bin, .log or .env files tracked (${tracked.length} files)`);
}

if (failures) {
  console.error(`\n${failures} development leftover(s). Remove them before committing (AGENTS.md, "No development leftovers").`);
  process.exit(1);
}
