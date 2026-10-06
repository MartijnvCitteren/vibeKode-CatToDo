# Watching traffic

mitmproxy runs in Docker (`compose.yaml`) to show the app's HTTP traffic in development: what the browser and CLI send to the app, and what the app sends to OpenRouter.

## Running it

- `npm run proxy` starts mitmweb; `npm run proxy:stop` stops it.
- The flow list is at http://localhost:8081 (password `todo-cat`); the ports are bound to 127.0.0.1 only.
- `npm run dev:proxy` starts the dev server on :3000 with its outbound traffic going through the proxy; plain `npm run dev` only shows inbound traffic.
- Browse http://localhost:8000 instead of :3000, and run the CLI with `TODO_CAT_URL=http://localhost:8000`, to have that traffic captured.

## How it is wired

- One mitmweb process runs two modes: `reverse` on :8000 forwards to `host.docker.internal:3000` (inbound), and `regular` on :8001 is a forward proxy (outbound).
- `scripts/dev-proxy.sh` sets `NODE_USE_ENV_PROXY=1` with `HTTP(S)_PROXY`, because Node's `fetch` ignores proxy env vars without it, and `NO_PROXY=localhost` so the app's calls to itself stay direct.
- mitmproxy writes its CA to the gitignored `.mitmproxy/`, and the script points `NODE_EXTRA_CA_CERTS` at it so OpenRouter's HTTPS can be decrypted; the CA appears on the first `npm run proxy`.

## Gotchas

- `keep_host_header` must stay on: Server Actions (sign-in, sign-up) reject a request whose `Origin` host differs from its `Host`.
- Better Auth rejects origins it doesn't trust, so the script adds `BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:8000`; with plain `npm run dev`, signing in through :8000 fails.
- `BETTER_AUTH_URL` still says :3000, so URLs the server builds, like the CLI's device login link, skip the proxy.
- `.mitmproxy/` holds the CA's private key; never commit it, and delete the directory to rotate the CA.
