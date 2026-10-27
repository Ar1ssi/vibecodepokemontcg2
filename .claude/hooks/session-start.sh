#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# graphifyy is the PyPI name of Graphify; the CLI and skill are still `graphify`.
pip install --quiet graphifyy
graphify install
