#!/usr/bin/env bash
# Runs every check an agent or CI needs before calling work done (see tech-docs/testing.md).
# Passing sections write only to the log; failing sections print their output; exits 1 if any failed.
set -uo pipefail

cd "$(dirname "$0")/.."

# Plain output for agents and CI logs.
export NO_COLOR=1 FORCE_COLOR=0 NEXT_TELEMETRY_DISABLED=1

log="${QA_LOG:-.qa/qa.log}"
mkdir -p "$(dirname "$log")"
: >"$log"

failed=()
passed=0

section() {
  local name="$1"
  shift
  local out start
  out="$(mktemp)"
  start=$SECONDS
  printf '\n===== %s: %s\n' "$name" "$*" >>"$log"
  if "$@" >"$out" 2>&1; then
    echo "PASS  $name ($((SECONDS - start))s)"
    passed=$((passed + 1))
  else
    echo "FAIL  $name ($((SECONDS - start))s): $*"
    cat "$out"
    echo "----- end of $name output"
    failed+=("$name")
  fi
  cat "$out" >>"$log"
  rm -f "$out"
}

section biome npx biome check --colors=off
section typecheck npm run typecheck
section build npx next build
section cli npm run build -w todo-cat-cli
section vitest npx vitest run
section playwright npx playwright test

echo
if ((${#failed[@]})); then
  echo "QA FAILED: ${#failed[@]} failed (${failed[*]}), $passed passed. Full log: $log"
  exit 1
fi
echo "QA PASSED: all $passed sections. Full log: $log"
