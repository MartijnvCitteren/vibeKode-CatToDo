#!/usr/bin/env bash
# Starts `next dev` with its outbound HTTP(S) routed through mitmproxy on :8001,
# trusting mitmproxy's CA, and with :8000 (the inbound proxy) as a trusted origin.
# Start the proxy first with `npm run proxy` (see tech-docs/traffic.md).
set -euo pipefail

ca=".mitmproxy/mitmproxy-ca-cert.pem"
if [[ ! -f $ca ]]; then
  echo "No mitmproxy CA at $ca; run \`npm run proxy\` first." >&2
  exit 1
fi

export NODE_USE_ENV_PROXY=1
export HTTP_PROXY=http://localhost:8001
export HTTPS_PROXY=http://localhost:8001
export NO_PROXY=localhost,127.0.0.1
export NODE_EXTRA_CA_CERTS="$PWD/$ca"
export BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:8000

exec next dev "$@"
