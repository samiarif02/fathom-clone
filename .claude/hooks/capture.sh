#!/bin/sh
# Hooks inherit Claude Code's PATH, which may not include an nvm-managed node
# (an IDE-launched session often doesn't), so find one rather than fail.
NODE=$(command -v node 2>/dev/null)
if [ -z "$NODE" ]; then
  for candidate in "$HOME"/.nvm/versions/node/*/bin/node /opt/homebrew/bin/node /usr/local/bin/node; do
    [ -x "$candidate" ] && NODE="$candidate"
  done
fi
if [ -z "$NODE" ]; then
  echo "agent-log capture failed: node not found" >&2
  exit 1
fi
exec "$NODE" "$(dirname "$0")/capture.mjs" "$@"
