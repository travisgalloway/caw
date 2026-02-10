#!/usr/bin/env bash
# Reset the spawner test environment.
#
# Usage:
#   ./examples/spawner-test/cleanup.sh [--global]
#
# Flags:
#   --global   Also remove the global DB at ~/.caw/workflows.db

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLE_DIR="$SCRIPT_DIR/example-project"

echo "Cleaning up spawner test environment..."

# 1. Remove any server.lock files (before deleting .caw dirs)
for lockfile in "$EXAMPLE_DIR/.caw/server.lock" "$HOME/.caw/server.lock"; do
  if [ -f "$lockfile" ]; then
    rm -f "$lockfile"
    echo "  Removed $lockfile"
  fi
done

# 2. Kill lingering caw daemon processes
PIDS=$(pgrep -f "caw.*--server" 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  echo "  Killing caw daemon processes: $PIDS"
  echo "$PIDS" | xargs kill 2>/dev/null || true
fi

# 3. Kill lingering claude -p processes from spawner
CLAUDE_PIDS=$(pgrep -f "claude -p" 2>/dev/null || true)
if [ -n "$CLAUDE_PIDS" ]; then
  echo "  Killing spawned claude processes: $CLAUDE_PIDS"
  echo "$CLAUDE_PIDS" | xargs kill 2>/dev/null || true
fi

# 4. Remove per-repo .caw directory
if [ -d "$EXAMPLE_DIR/.caw" ]; then
  rm -rf "$EXAMPLE_DIR/.caw"
  echo "  Removed $EXAMPLE_DIR/.caw/"
fi

# 5. Optionally remove global DB
if [ "${1:-}" = "--global" ]; then
  if [ -f "$HOME/.caw/workflows.db" ]; then
    rm -f "$HOME/.caw/workflows.db" "$HOME/.caw/workflows.db-wal" "$HOME/.caw/workflows.db-shm"
    echo "  Removed global DB at ~/.caw/workflows.db"
  fi
fi

# 6. Clean up temp MCP config files
for tmpfile in "$TMPDIR"/caw-mcp-*.json; do
  if [ -f "$tmpfile" ]; then
    rm -f "$tmpfile"
    echo "  Removed temp MCP config: $tmpfile"
  fi
done

# 7. Reset example project files to original state
cd "$EXAMPLE_DIR"
if [ -d .git ]; then
  git checkout -- . 2>/dev/null || true
  git clean -fd 2>/dev/null || true
  echo "  Reset example-project files via git checkout"
fi

echo "Done."
