/** Self-contained Node.js CLI included in the application ZIP. */
export const DEPLOY_SCRIPT = `import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {isIP} from 'node:net';
const exec = promisify(execFile);
const root = dirname(fileURLToPath(import.meta.url));
const read = path => {try {return readFileSync(resolve(root, path), 'utf8');} catch {throw new Error('Missing runtime configuration: ' + path);}};
const raw = path => {
  const result = Object.create(null);
  for (const line of read(path).split(/\\r?\\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || Object.hasOwn(result, match[1])) throw new Error('Use unique literal KEY=value lines in ' + path);
    result[match[1]] = match[2];
  }
  return result;
};
const origin = value => {
  try {const u = new URL(value); return !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash && (u.protocol === 'https:' || u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname));} catch {return false;}
};
const publicDomain = value => {
  try {
    const u = new URL(value);
    const labels = u.hostname.split('.');
    if (!origin(value) || u.protocol !== 'https:' || u.port || isIP(u.hostname) || u.hostname.length > 253 || labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || /(?:^|\\.)(?:localhost|local|internal|test|invalid|example)$/.test(u.hostname) || u.hostname.endsWith('.home.arpa') || u.hostname.endsWith('.ts.net')) throw new Error();
    return u.hostname;
  } catch {throw new Error('Public HTTPS requires a DNS hostname in APP_ORIGIN, with no custom port or local/reserved domain.');}
};
export const verifyPublicOrigin = async (value, request = fetch) => {
  publicDomain(value);
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('Remove NODE_TLS_REJECT_UNAUTHORIZED=0 before HTTPS verification.');
  const target = new URL('/__levoks/health', value);
  const signal = AbortSignal.timeout(10000);
  try {
    const response = await request(target, {redirect: 'error', cache: 'no-store', signal});
    if (response.status !== 200 || !response.headers.get('content-type')?.includes('application/json')) {await response.body?.cancel(); throw new Error();}
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    let body = '', size = 0;
    try {
      const decoder = new TextDecoder();
      for (;;) {const {done, value: chunk} = await reader.read(); if (done) break; size += chunk.length; if (size > 4096) throw new Error(); body += decoder.decode(chunk, {stream: true});}
      body += decoder.decode();
    } finally {await reader.cancel();}
    if (JSON.parse(body).status !== 'ready') throw new Error();
    const http = new URL(target); http.protocol = 'http:';
    const redirect = await request(http, {redirect: 'manual', cache: 'no-store', signal});
    await redirect.body?.cancel();
    const location = redirect.headers.get('location');
    if (![301, 308].includes(redirect.status) || !location || new URL(location, http).href !== target.href) throw new Error();
  } catch {throw new Error('Public HTTPS verification failed. Check DNS, certificate trust, HTTP redirection and application readiness. No public readiness was confirmed.');}
  console.log('Public HTTPS certificate trust, HTTP redirect and application readiness passed.');
};
export const runDeployment = async (argv = process.argv.slice(2), execute = exec, request = fetch) => {
  const [command, ...flags] = argv;
  if (!['check', 'up', 'status', 'verify'].includes(command) || flags.some(flag => !['--identity-email', '--notifications', '--https'].includes(flag))) throw new Error('Usage: node deploy.mjs check|up|status|verify [--https] [--identity-email] [--notifications]');
  const settings = parseEnv(read('.env'));
  if (command === 'verify') {if (flags.length) throw new Error('Usage: node deploy.mjs verify'); await verifyPublicOrigin(settings.APP_ORIGIN, request); return;}
  const manifest = JSON.parse(read('deployment/manifest.json'));
  const profiles = [...new Set(flags.map(flag => flag.slice(2)))];
  if (profiles.some(profile => !manifest.profiles.includes(profile))) throw new Error('Selected profile is absent from this application.');
  if (command !== 'status' && manifest.blockers.length) throw new Error(manifest.blockers.join(' '));
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(settings.COMPOSE_PROJECT_NAME || '')) throw new Error('Set a stable lowercase COMPOSE_PROJECT_NAME.');
  if (!origin(settings.APP_ORIGIN)) throw new Error('APP_ORIGIN must be an HTTPS origin or a local HTTP origin, without a path or credentials.');
  const domain = profiles.includes('https') ? publicDomain(settings.APP_ORIGIN) : 'unconfigured.invalid';
  if (profiles.includes('https') && process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('Remove NODE_TLS_REJECT_UNAUTHORIZED=0 before HTTPS deployment.');
  if (!/^\\d+$/.test(settings.FRONTEND_PORT || '') || Number(settings.FRONTEND_PORT) < 1024 || Number(settings.FRONTEND_PORT) > 65535) throw new Error('FRONTEND_PORT must be between 1024 and 65535.');
  for (const key of manifest.rootKeys) {
    if (!settings[key] || settings[key].includes('$')) throw new Error('Set ' + key + ' in .env; URL-encode dollar signs in database URLs.');
    if (key === 'JWT_SECRET' && settings[key].length < 32) throw new Error('JWT_SECRET needs at least 32 random characters.');
    if (key.endsWith('_DB_PASSWORD') && !/^[A-Za-z0-9_-]{16,}$/.test(settings[key])) throw new Error(key + ' needs at least 16 URL-safe random characters.');
  }
  if (command !== 'status') for (const requirement of manifest.requirements) {
    if (requirement.profile && !profiles.includes(requirement.profile)) continue;
    const values = raw(requirement.path);
    for (const key of requirement.keys) if (!values[key]?.trim()) throw new Error('Set ' + key + ' in ' + requirement.path);
    if (values.OPERATOR_SETUP_TOKEN && !/^[a-f0-9]{64}$/i.test(values.OPERATOR_SETUP_TOKEN)) throw new Error('OPERATOR_SETUP_TOKEN needs a random 64-character hexadecimal value.');
    if (values.IDENTITY_EMAIL_KEYS) {
      let keys; try {keys = JSON.parse(values.IDENTITY_EMAIL_KEYS);} catch {throw new Error('IDENTITY_EMAIL_KEYS must contain a JSON keyring without surrounding quotes.');}
      if (!keys || typeof keys !== 'object' || Array.isArray(keys) || !Object.hasOwn(keys, values.IDENTITY_EMAIL_ACTIVE_KEY) || Object.values(keys).some(key => typeof key !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(key) || Buffer.from(key, 'base64').length !== 32)) throw new Error('Identity keyring needs base64 32-byte keys and a matching active key.');
    }
  }
  // Explicit runtime settings win over inherited host variables; unrelated
  // Compose controls cannot select another file, profile or project.
  const env = {...process.env, ...settings};
  env.LEVOKS_DOMAIN = domain;
  for (const key of Object.keys(env)) if (key.startsWith('COMPOSE_')) delete env[key];
  env.COMPOSE_DISABLE_ENV_FILE = 'true';
  const invoke = async (args, timeout = 30000) => {
    try {return await execute('docker', ['compose', ...args], {cwd: root, env, timeout, maxBuffer: 1048576, windowsHide: true});}
    catch {throw new Error('Docker Compose command failed. Inspect the server configuration and container logs privately. No success was recorded.');}
  };
  const version = (await invoke(['version', '--short'])).stdout.trim().replace(/^v/, '').split('.').map(Number);
  if (!Number.isInteger(version[0]) || version[0] < 2 || version[0] === 2 && (!Number.isInteger(version[1]) || version[1] < 30)) throw new Error('Docker Compose 2.30 or newer is required.');
  const args = ['--project-name', settings.COMPOSE_PROJECT_NAME, '--env-file', resolve(root, '.env'), '-f', resolve(root, 'compose.yaml'), ...profiles.flatMap(profile => ['--profile', profile])];
  await invoke([...args, 'config', '--quiet']);
  if (command === 'check') {console.log('Runtime settings and Compose configuration are valid. No containers were started.'); return;}
  if (command === 'up') {
    console.log('Building and starting the full application; waiting for database, API, frontend and selected worker health.');
    await invoke([...args, 'up', '--build', '--wait', '--wait-timeout', '180', '--quiet-build'], 1800000);
    console.log('Compose startup and health gates passed. Run application and external-provider acceptance checks before release.');
    if (profiles.includes('https')) {
      for (let attempt = 0; ; attempt++) {
        try {await verifyPublicOrigin(settings.APP_ORIGIN, request); break;}
        catch (error) {if (attempt === 5) throw error; await new Promise(done => setTimeout(done, 5000));}
      }
    }
  }
  const output = (await invoke([...args, 'ps', '--all', '--format', 'json'])).stdout.trim();
  let rows; try {rows = output.startsWith('[') ? JSON.parse(output) : output.split(/\\r?\\n/).filter(Boolean).map(line => JSON.parse(line));} catch {throw new Error('Container status response was invalid.');}
  for (const row of rows) {
    const label = /^[a-z0-9_-]+$/.test(row.Service) ? row.Service : 'service';
    const state = ['running', 'exited', 'created', 'restarting', 'paused', 'dead', 'removing'].includes(row.State) ? row.State : 'unknown';
    const health = ['healthy', 'unhealthy', 'starting'].includes(row.Health) ? row.Health : 'no health probe';
    console.log(label + ': ' + state + ' / ' + health);
  }
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runDeployment().catch(error => {console.error(error instanceof Error ? error.message : 'Deployment failed.'); process.exitCode = 1;});
`;
