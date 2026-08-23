#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/../.." && pwd)"
test_dir="$(mktemp -d /private/tmp/pcss-store-test.XXXXXX)"
trap 'rm -rf "$test_dir"' EXIT

MACOSX_DEPLOYMENT_TARGET=13.0 clang \
  -fobjc-arc \
  -O0 \
  -framework Foundation \
  -lsqlite3 \
  "$project_root/desktop/native/PCSSStore.m" \
  "$project_root/desktop/native/PCSSStoreTests.m" \
  -o "$test_dir/PCSSStoreTests"

"$test_dir/PCSSStoreTests"
