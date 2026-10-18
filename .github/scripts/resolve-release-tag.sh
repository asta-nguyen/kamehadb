#!/usr/bin/env bash
# Validate one release tag and emit the value used for checkout and release.
#
# Reads the candidate from the RELEASE_TAG environment variable (a tag push's
# ref name or the workflow_dispatch input). Fails closed: on any invalid input
# it prints nothing to stdout and exits non-zero so a bad ref can never reach
# checkout or a release mutation.
set -euo pipefail

fail() {
  echo "resolve-release-tag: $1" >&2
  exit 1
}

tag="${RELEASE_TAG:-}"

[ -n "$tag" ] || fail "no release tag provided"

# Reject whitespace and control characters (including newlines). A crafted
# value could otherwise split into extra shell/git arguments.
if printf '%s' "$tag" | grep -Eq '[[:space:]]'; then
  fail "release tag contains whitespace or control characters: $(printf '%q' "$tag")"
fi

# Only version tags are released: v<major>.<minor>.<patch> with an optional
# dotted prerelease suffix, for example v1.2.3 or v1.2.3-rc.1.
if ! printf '%s' "$tag" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z][0-9A-Za-z.-]*)?$'; then
  fail "not a valid release tag: $(printf '%q' "$tag")"
fi

# The value must also be a valid Git ref name, which rejects shapes the pattern
# above still allows (for example a ".." sequence).
if ! git check-ref-format "refs/tags/$tag" >/dev/null 2>&1; then
  fail "not a valid Git ref: $(printf '%q' "$tag")"
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  printf 'value=%s\n' "$tag" >> "$GITHUB_OUTPUT"
fi
printf '%s\n' "$tag"
