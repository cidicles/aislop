#!/usr/bin/env node
// Publish a project to https://aislop.cloud/<slug>/. Zero dependencies.
//
//   node C:\sites\aislop\deploy.js [projectDir] [--skip-build] [--dry-run]
//   node C:\sites\aislop\deploy.js --infra
//
// A project deploy reads <projectDir>/aislop.json, runs its "build" command, packs
// project.json + payload/ (+ thumb.<ext>) into a tar and streams it over ssh into
// `aislop deploy` on the droplet, which swaps the files in, (re)starts the container for
// docker projects, regenerates the Caddy routes and updates the landing page.
// --infra pushes ./server (the aislop CLI, Caddyfile, landing page) to /srv/aislop and
// runs setup.sh there. See README.md.

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOST = process.env.AISLOP_HOST || 'root@167.172.198.106';
const LOCAL_ONLY = ['build', 'dir', 'files', 'thumbnail'];
// Windows' built-in bsdtar: Git Bash's GNU tar would read the "C:" in a path as a remote host.
const TAR = process.platform === 'win32'
  ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
  : 'tar';
const INFRA_CMD = 'mkdir -p /srv/aislop && tar --no-same-owner --warning=no-unknown-keyword -xf - -C /srv/aislop'
  + " && sed -i 's/\\r$//' /srv/aislop/setup.sh /srv/aislop/bin/aislop && bash /srv/aislop/setup.sh";

class DeployError extends Error {}
const fail = (msg) => { throw new DeployError(msg); };

const exited = (child) => new Promise((resolve) => {
  child.on('close', resolve);
  child.on('error', (e) => { console.error(e.message); resolve(1); });
});

// Stream `tar -cf - .` of dir into `ssh HOST remoteCmd`; true if both exit cleanly.
async function ship(dir, remoteCmd) {
  const tar = spawn(TAR, ['-cf', '-', '.'], { cwd: dir, stdio: ['ignore', 'pipe', 'inherit'] });
  const ssh = spawn('ssh', ['-o', 'BatchMode=yes', HOST, remoteCmd], { stdio: ['pipe', 'inherit', 'inherit'] });
  ssh.stdin.on('error', () => {}); // ssh died early; its own error is already on stderr
  tar.stdout.pipe(ssh.stdin);
  const codes = await Promise.all([exited(tar), exited(ssh)]);
  return codes.every((c) => c === 0);
}

// Every .env / .env.* file under dir, as relative paths.
function findSecrets(dir, rel = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (/^\.env($|\.)/.test(e.name)) return [r];
    return e.isDirectory() ? findSecrets(path.join(dir, e.name), r) : [];
  });
}

function describe(dir) {
  let files = 0;
  let bytes = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!e.isFile()) continue;
    files++;
    bytes += fs.statSync(path.join(e.parentPath ?? e.path, e.name)).size;
  }
  return `${files} files, ${(bytes / 1048576).toFixed(1)} MB`;
}

async function deployProject(dir, flags) {
  const mfile = path.join(dir, 'aislop.json');
  if (!fs.existsSync(mfile)) fail(`no aislop.json in ${dir}`);
  const m = JSON.parse(fs.readFileSync(mfile, 'utf8'));
  if (m.build && !flags.has('--skip-build')) {
    console.log(`> ${m.build}`);
    execSync(m.build, { cwd: dir, stdio: 'inherit' });
  }

  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'aislop-'));
  try {
    const payload = path.join(stage, 'payload');
    if (m.type === 'static') {
      if (!m.dir || !fs.existsSync(path.join(dir, m.dir))) fail(`"dir" must point at the built site (got ${m.dir})`);
      fs.cpSync(path.join(dir, m.dir), payload, { recursive: true });
    } else if (m.type === 'docker') {
      if (!m.files?.length) fail('docker projects need "files": the build context to upload');
      for (const f of m.files) {
        if (!fs.existsSync(path.join(dir, f))) fail(`"files" lists ${f}, which doesn't exist`);
        fs.cpSync(path.join(dir, f), path.join(payload, f), { recursive: true });
      }
    } else {
      fail('"type" must be "static" or "docker"');
    }

    const secrets = findSecrets(payload);
    if (secrets.length) {
      fail(`refusing to upload ${secrets.join(', ')}; runtime secrets go in /srv/aislop/projects/${m.slug}/.env on the server`);
    }
    if (m.thumbnail) {
      fs.copyFileSync(path.join(dir, m.thumbnail), path.join(stage, `thumb${path.extname(m.thumbnail).toLowerCase()}`));
    }
    const manifest = Object.fromEntries(Object.entries(m).filter(([k]) => !LOCAL_ONLY.includes(k)));
    fs.writeFileSync(path.join(stage, 'project.json'), JSON.stringify(manifest, null, 2));

    console.log(`${m.slug} (${m.type}): ${describe(payload)}`);
    if (flags.has('--dry-run')) return true;
    return await ship(stage, 'aislop deploy');
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const ok = flags.has('--infra')
    ? await ship(path.join(__dirname, 'server'), INFRA_CMD)
    : await deployProject(path.resolve(args.find((a) => !a.startsWith('--')) ?? '.'), flags);
  process.exitCode = ok ? 0 : 1;
}

main().catch((e) => {
  console.error(`deploy: ${e.message}`);
  process.exitCode = 1;
});
