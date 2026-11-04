#!/usr/bin/env bash
set -euo pipefail

REPO="Hammertail/catlex"
INSTALL_DIR="${CATLEX_INSTALL_DIR:-${HOME}/.local/bin}"
BINARY_NAME="catlex"

detect_os() {
  case "$(uname -s)" in
    Linux) echo "linux" ;;
    Darwin) echo "darwin" ;;
    *)
      echo "Unsupported operating system: $(uname -s)" >&2
      echo "Supported: Linux, macOS (Darwin)." >&2
      exit 1
      ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64 | amd64) echo "x64" ;;
    aarch64 | arm64) echo "arm64" ;;
    *)
      echo "Unsupported architecture: $(uname -m)" >&2
      echo "Supported: x64, arm64." >&2
      exit 1
      ;;
  esac
}

OS="$(detect_os)"
ARCH="$(detect_arch)"
ASSET_NAME="catlex-${OS}-${ARCH}"

VERSION="${CATLEX_VERSION:-}"
if [[ -z "${VERSION}" || "${VERSION}" == "latest" ]]; then
  RELEASE_URL="$(curl -fsSLI --retry 3 -o /dev/null -w '%{url_effective}' "https://github.com/${REPO}/releases/latest")"
  VERSION="${RELEASE_URL##*/}"
fi
VERSION="${VERSION#v}"
if [[ ! "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid release version: ${VERSION}" >&2
  exit 1
fi
BASE_URL="https://github.com/${REPO}/releases/download/v${VERSION}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

echo "Downloading catlex (${OS}/${ARCH}) ${VERSION}..."
curl -fsSL --retry 3 "${BASE_URL}/${ASSET_NAME}" -o "${TMP_DIR}/${ASSET_NAME}"
curl -fsSL --retry 3 "${BASE_URL}/SHA256SUMS" -o "${TMP_DIR}/SHA256SUMS"
EXPECTED="$(awk -v asset="${ASSET_NAME}" '$2 == asset { print $1; count++ } END { if (count != 1) exit 1 }' "${TMP_DIR}/SHA256SUMS")"
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "${TMP_DIR}/${ASSET_NAME}" | awk '{ print $1 }')"
else
  ACTUAL="$(shasum -a 256 "${TMP_DIR}/${ASSET_NAME}" | awk '{ print $1 }')"
fi
if [[ ! "${EXPECTED}" =~ ^[0-9a-fA-F]{64}$ || "${ACTUAL}" != "${EXPECTED}" ]]; then
  echo "Checksum verification failed for ${ASSET_NAME}" >&2
  exit 1
fi
mkdir -p "${INSTALL_DIR}"
chmod +x "${TMP_DIR}/${ASSET_NAME}"
mv "${TMP_DIR}/${ASSET_NAME}" "${INSTALL_DIR}/${BINARY_NAME}"

echo "Installed ${INSTALL_DIR}/${BINARY_NAME}"

case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    echo
    echo "Warning: ${INSTALL_DIR} is not in your PATH."
    echo "Add this to your shell profile:"
    echo "  export PATH=\"${INSTALL_DIR}:\${PATH}\""
    ;;
esac
