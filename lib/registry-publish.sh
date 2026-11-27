#!/usr/bin/env bash
# Publish (or skip) one registry: npmjs | github-packages
set -euo pipefail

REGISTRY_KIND="${INPUT_REGISTRY_KIND:?registry-kind required}" # npmjs | github-packages
PACKAGE_NAME="${INPUT_PACKAGE_NAME:?}"
PACKAGE_VERSION="${INPUT_PACKAGE_VERSION:?}"
PACKAGE_SCOPE="${INPUT_PACKAGE_SCOPE:-}"
NODE_AUTH_TOKEN="${NODE_AUTH_TOKEN:-}"
NPM_ACCESS="${INPUT_NPM_ACCESS:-public}"
SKIP_IF_EXISTS="${INPUT_SKIP_IF_EXISTS:-true}"
INSTALL_DEPS="${INPUT_INSTALL_DEPS:-true}"
VERIFY_PACK="${INPUT_VERIFY_PACK:-true}"
DIST_TAG_INPUT="${INPUT_DIST_TAG:-auto}"

# Trust-boundary allowlists (defense in depth; Node meta step validates first).
if [[ ! "${PACKAGE_NAME}" =~ ^(@[A-Za-z0-9][A-Za-z0-9._-]*/)?[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "::error::Invalid package name for publish" >&2
  exit 1
fi
if [[ ! "${PACKAGE_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]]; then
  echo "::error::Invalid package version for publish" >&2
  exit 1
fi
if [[ -n "${PACKAGE_SCOPE}" && ! "${PACKAGE_SCOPE}" =~ ^@[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "::error::Invalid package scope for publish" >&2
  exit 1
fi
if [[ "${NPM_ACCESS}" != "public" && "${NPM_ACCESS}" != "restricted" ]]; then
  echo "::error::npm-access must be public or restricted" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_TAG="$(node "${SCRIPT_DIR}/resolve-dist-tag.mjs" "${PACKAGE_VERSION}" "${DIST_TAG_INPUT}")"
echo "Publishing ${PACKAGE_VERSION} to ${REGISTRY_KIND:-registry} under dist-tag '${DIST_TAG}'."

# npmjs may publish without a token: trusted publishing exchanges the GitHub OIDC
# token (requires `permissions: id-token: write`). GitHub Packages always needs one.
USE_TRUSTED_PUBLISHING=false
if [[ -z "${NODE_AUTH_TOKEN}" ]]; then
  if [[ "${REGISTRY_KIND}" != "npmjs" ]]; then
    echo "::error::token is required for ${REGISTRY_KIND}" >&2
    exit 1
  fi
  if [[ -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]]; then
    echo "::error::npm-token is empty and no GitHub OIDC token is available; add 'permissions: id-token: write' for trusted publishing" >&2
    exit 1
  fi
  USE_TRUSTED_PUBLISHING=true
fi

case "${REGISTRY_KIND}" in
  npmjs)
    REGISTRY_URL="https://registry.npmjs.org"
    ;;
  github-packages)
    REGISTRY_URL="https://npm.pkg.github.com"
    ;;
  *)
    echo "::error::Unknown registry-kind: ${REGISTRY_KIND}" >&2
    exit 1
    ;;
esac

exists=false
if npm view "${PACKAGE_NAME}@${PACKAGE_VERSION}" version --registry="${REGISTRY_URL}" >/dev/null 2>&1; then
  exists=true
fi

echo "exists=${exists}" >>"${GITHUB_OUTPUT}"
echo "registry=${REGISTRY_URL}" >>"${GITHUB_OUTPUT}"

if [[ "${exists}" == "true" && "${SKIP_IF_EXISTS}" == "true" ]]; then
  echo "skipped=true" >>"${GITHUB_OUTPUT}"
  echo "published=false" >>"${GITHUB_OUTPUT}"
  echo "Version ${PACKAGE_VERSION} already exists on ${REGISTRY_KIND}; skipping."
  exit 0
fi

echo "skipped=false" >>"${GITHUB_OUTPUT}"

if [[ "${INSTALL_DEPS}" == "true" ]]; then
  pnpm install --frozen-lockfile --ignore-scripts
fi

if [[ "${VERIFY_PACK}" == "true" ]]; then
  # pnpm doesn't support publish --dry-run; pack then remove tarball
  pnpm pack
  rm -f ./*.tgz || true
fi

if [[ -n "${PACKAGE_SCOPE}" ]]; then
  npm config set "${PACKAGE_SCOPE}:registry" "${REGISTRY_URL}"
fi
npm config set registry "${REGISTRY_URL}"
# With trusted publishing, no token is written: an empty _authToken would block the OIDC exchange.
if [[ "${USE_TRUSTED_PUBLISHING}" == "false" ]]; then
  npm config set "//${REGISTRY_URL#https://}/:_authToken" "${NODE_AUTH_TOKEN}"
fi

set +e
if [[ "${REGISTRY_KIND}" == "npmjs" ]]; then
  pnpm publish --access "${NPM_ACCESS}" --no-git-checks --tag "${DIST_TAG}" --registry "${REGISTRY_URL}"
else
  pnpm publish --no-git-checks --tag "${DIST_TAG}" --registry "${REGISTRY_URL}"
fi
status=$?
set -e

if [[ "${status}" -eq 0 ]]; then
  echo "published=true" >>"${GITHUB_OUTPUT}"
  echo "Published ${PACKAGE_NAME}@${PACKAGE_VERSION} to ${REGISTRY_KIND} (dist-tag ${DIST_TAG})"
  exit 0
fi

# Race: another publish may have landed between check and publish
if npm view "${PACKAGE_NAME}@${PACKAGE_VERSION}" version --registry="${REGISTRY_URL}" >/dev/null 2>&1; then
  echo "published=false" >>"${GITHUB_OUTPUT}"
  echo "skipped=true" >>"${GITHUB_OUTPUT}"
  echo "Version already exists after publish attempt; treating as skip."
  exit 0
fi

echo "published=false" >>"${GITHUB_OUTPUT}"
echo "::error::Publish to ${REGISTRY_KIND} failed" >&2
exit 1
