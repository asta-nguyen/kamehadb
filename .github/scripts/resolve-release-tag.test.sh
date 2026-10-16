#!/usr/bin/env bash
# Exercises resolve-release-tag.sh acceptance and rejection cases. Runs without
# a repository; only the resolver's own validation is under test.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
script="$here/resolve-release-tag.sh"
failures=0

expect_accept() {
  local input="$1" out status
  out="$(RELEASE_TAG="$input" GITHUB_OUTPUT= "$script" 2>/dev/null)"
  status=$?
  if [ "$status" -ne 0 ] || [ "$out" != "$input" ]; then
    echo "FAIL: expected to accept '$input' (status=$status out='$out')"
    failures=$((failures + 1))
  fi
}

expect_reject() {
  local input="$1" out status
  out="$(RELEASE_TAG="$input" GITHUB_OUTPUT= "$script" 2>/dev/null)"
  status=$?
  if [ "$status" -eq 0 ]; then
    echo "FAIL: expected to reject '$input'"
    failures=$((failures + 1))
  fi
  if [ -n "$out" ]; then
    echo "FAIL: rejected '$input' still emitted a tag: '$out'"
    failures=$((failures + 1))
  fi
}

expect_accept "v1.2.3"
expect_accept "v1.2.3-rc.1"
expect_reject "v1.2"
expect_reject "1.2.3"
expect_reject "main"
expect_reject "refs/heads/main"
expect_reject "v1.2.3.."
expect_reject "v1.2.3-a..b"
expect_reject "v1.2.3; rm -rf /"
expect_reject "v1.2.3 \$(whoami)"
expect_reject "$(printf 'v1.2.3\nmalicious')"
expect_reject ""

if [ "$failures" -ne 0 ]; then
  echo "$failures case(s) failed"
  exit 1
fi
echo "all resolve-release-tag cases passed"
