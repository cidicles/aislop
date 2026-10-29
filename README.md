# aislop.cloud

The landing page at **https://aislop.cloud** lists every project; each project lives at
`https://aislop.cloud/<slug>/`. Everything runs on one DigitalOcean droplet
(`root@167.172.198.106`, ~460 MB RAM + 1 GB swap) behind a single Caddy container with
automatic HTTPS. DNS has only `aislop.cloud` (A) and `www` (CNAME), so projects are
sub-paths, not subdomains.

```
deploy.js            publish a project from this machine (zero-dependency Node)
server/              mirrored to /srv/aislop on the droplet by `deploy.js --infra`
  bin/aislop         the server-side CLI (python3): deploy, list, logs, up, remove, rebuild
  caddy/Caddyfile    the only hand-written Caddy config; per-project routes are generated
  www/               landing page (index.html reads projects.json + meta.json), 404.html, favicon
DESIGN.md            the landing page's design system (tokens, type, components, do/don't)
  setup.sh           idempotent server setup: swap, CLI symlink, Caddy container
```

## Publish a project

1. Add an `aislop.json` to the project's root (examples below).
2. Run `node C:\sites\aislop\deploy.js C:\sites\<project>`. Add `--dry-run` to see what would
   be uploaded, or `--skip-build` to reuse the current build output.

That runs the build, uploads the payload over ssh and runs `aislop deploy` on the server,
which swaps the files in atomically, (re)starts the container for docker projects,
regenerates the Caddy routes, validates and hot-reloads Caddy, and adds the project to the
landing page. Re-running it is how you update. The first deploy creates the project.

**Static site** (just files, served straight by Caddy with no container and no RAM cost):

```json
{
  "slug": "hard-launch",
  "name": "Hard Launch",
  "tagline": "One or two sentences for the card.",
  "tags": ["deckbuilder", "roguelike"],
  "created": "2026-09-10",
  "type": "static",
  "build": "npm run build:web",
  "dir": "web-build",
  "thumbnail": "aislop-thumb.jpg"
}
```

**Docker app** (anything with a server, e.g. WebSockets):

```json
{
  "slug": "memebreak",
  "name": "MemeBreak",
  "tagline": "...",
  "tags": ["fps", "co-op"],
  "created": "2026-09-11",
  "aliases": ["mazebreak"],
  "type": "docker",
  "build": "npm run build",
  "files": ["Dockerfile", ".dockerignore", "package.json", "package-lock.json", "server", "dist"],
  "memory": "160m",
  "volumes": ["data:/data"],
  "thumbnail": "aislop-thumb.jpg"
}
```

A deploy replaces `app/` and recreates the container, so anything the app wrote
*inside* the container is gone. A project that keeps state needs `volumes`: each
entry is `<name>:<path in container>`, where `<name>` is a directory beside
`app/` in the project's own folder — `replace_dir` never touches it, so it
survives every redeploy. The name is resolved inside the project directory and
cannot escape it, so a manifest cannot ask to mount `/etc` or another project's
data. The directory is created on first deploy and handed to whatever user the
image runs as (asked of the image, so an image that runs as root works too).

Note that `aislop remove` deletes the project folder, **including its
volumes**. There is no backup.

| Field | |
| --- | --- |
| `slug` | URL path: lowercase letters, digits, dashes. Also names the container `aislop-<slug>`. |
| `name`, `tagline`, `tags` | What the landing-page card shows. |
| `created` | `YYYY-MM-DD`. Sorts the landing page (newest first); cards under 14 days old get a NEW sticker. |
| `thumbnail` | Card image, 16:10 (e.g. 1216×760 JPG). Optional: without one, the card gets a colour gradient. |
| `type` | `static` or `docker`. |
| `build` | Command run in the project dir before packing. Optional. |
| `dir` | *static:* the built site folder to upload. |
| `files` | *docker:* the files/folders forming the build context (must include a `Dockerfile`). |
| `containerPort` | *docker:* port the app listens on inside the container (default `8080`). |
| `memory` | *docker:* memory cap (default `256m`). The droplet is tiny, so keep this honest. |
| `volumes` | *docker:* `["name:/path"]` directories that survive redeploys. See above. |
| `port` | *docker:* pin the host port. Normally leave it out; the server assigns one from 5200+. |
| `aliases` | Extra slugs that redirect to this one (old names). |
| `hidden` | `true` keeps it deployed but off the landing page (handy for testing). |
| `models`, `repo` | Claude model ids that built it (primary first) and its GitHub URL. Optional: `www/meta.json` supplies them otherwise. |

### Making a project work under `/<slug>/`

This is the one thing that bites. The project must not assume it's at the site root:

- Use **relative** asset URLs (`src="game.js"`, not `/game.js`). For Vite, set `base: './'`.
- Build WebSocket / fetch URLs from `location` (e.g. `new URL('ws', location.href)`), never `/ws`.
- Docker apps receive requests with the prefix **stripped**: `/memebreak/ws` arrives as `/ws`.
- Browsers only allow the microphone, camera, etc. over HTTPS, and aislop.cloud is always HTTPS.

### Secrets

`deploy.js` refuses to upload any `.env*` file. A docker project that needs runtime
secrets gets them from `/srv/aislop/projects/<slug>/.env` on the server (passed as
`--env-file`). Create it there by hand, then run `aislop up <slug>`.

## Server commands

`ssh root@167.172.198.106`, then:

```
aislop list               projects, type, port, container status
aislop logs <slug> [-f]   container logs
aislop up <slug>          rebuild + restart a docker project from its files on disk
aislop remove <slug>      unpublish and delete a project (container, image, files, thumb)
aislop rebuild            regenerate routes + projects.json and reload Caddy
```

## Landing-page metadata (`www/meta.json`)

`projects.json` only carries manifest fields, so `www/meta.json` adds per-slug
`models`, `repo`, `kind` (game/tool/experiment, drives the filter), `blurb`, `stack`,
`span` (build days per model, drives the timeline), `memory` (drives the memory
budget) and `shot` (a thumbnail shipped in `www/shots/` for projects deployed without
one). It ships with `--infra`, so editing it never redeploys a project. Fields in
the manifest win over meta.json.

## Changing the landing page or Caddy config

Edit files under `server/`, then run `node C:\sites\aislop\deploy.js --infra`. That syncs
`server/` over `/srv/aislop` (it never touches `projects/`, `www/thumbs/` or
`www/projects.json`) and re-runs `setup.sh`, which validates the config and hot-reloads Caddy.

## On the server

```
/srv/aislop/
  bin/aislop  setup.sh
  caddy/Caddyfile            hand-written (from server/caddy)
  caddy/projects/<slug>.caddy   generated: one route per project
  projects/<slug>/
    project.json             manifest as deployed, plus server fields (port, thumb, updated)
    public/                  static site files      (type static)
    app/                     docker build context   (type docker)
    <name>/                  persistent volumes, survive redeploys (docker; see "volumes")
    .env                     optional runtime secrets (docker; never uploaded)
  www/                       landing page + generated projects.json + thumbs/
```

Caddy is the `caddy` container (`caddy:2-alpine`, `--network host`), with `/srv/aislop` mounted
read-only at the same path. Certificates live in the `caddy_data` volume. Docker projects
listen on `127.0.0.1:<port>` only. The public reaches them through Caddy.

Legacy addresses still work: `http://167.172.198.106/` and `https://167-172-198-106.sslip.io/`
redirect to `/hard-launch/` (what used to live at the root), and every other path redirects to
the same path on aislop.cloud (so the old `/memebreak/` links keep working).

## Built with

Written with [Claude Code](https://claude.com/claude-code). Model: Claude Opus 5 (`claude-opus-5`); the 2026-10 landing-page redesign by Claude Opus 5.5 (`claude-opus-5-5`).

Part of the [aislop.cloud](https://aislop.cloud) portfolio.
