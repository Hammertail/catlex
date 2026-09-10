#!/usr/bin/env bash
set -euo pipefail

REPO="Hammertail/catlex"
INSTALL_DIR="${HOME}/.local/bin"
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

verify_checksum() {
  local asset_name="$1"
  local binary_path="$2"
  local checksums_url="$3"
  local checksums_file="$4"

  if [[ "${CATLEX_SKIP_CHECKSUM:-}" == "1" ]]; then
    echo "Skipping checksum verification (CATLEX_SKIP_CHECKSUM=1)."
    return 0
  fi

  if ! curl -fsSL "${checksums_url}" -o "${checksums_file}"; then
    if [[ "${CATLEX_REQUIRE_CHECKSUM:-}" == "1" ]]; then
      echo "Error: SHA256SUMS is required but was not found at ${checksums_url}" >&2
      exit 1
    fi
    echo "Warning: SHA256SUMS not found at ${checksums_url}; skipping integrity check." >&2
    echo "Set CATLEX_REQUIRE_CHECKSUM=1 in CI to fail closed once checksums are published." >&2
    return 0
  fi

  if ! grep -E "[[:space:]]${asset_name}\$" "${checksums_file}" >/dev/null; then
    echo "Error: ${asset_name} is missing from SHA256SUMS" >&2
    exit 1
  fi

  local expected
  expected="$(grep -E "[[:space:]]${asset_name}\$" "${checksums_file}" | awk '{print $1}')"
  local actual
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "${binary_path}" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "${binary_path}" | awk '{print $1}')"
  else
    echo "Error: neither sha256sum nor shasum is available for checksum verification" >&2
    exit 1
  fi
  if [[ "${expected}" != "${actual}" ]]; then
    echo "Error: checksum mismatch for ${asset_name}" >&2
    echo "  expected: ${expected}" >&2
    echo "  actual:   ${actual}" >&2
    exit 1
  fi

  echo "Checksum verified for ${asset_name}."
}

OS="$(detect_os)"
ARCH="$(detect_arch)"
ASSET_NAME="catlex-${OS}-${ARCH}"

if [[ -n "${CATLEX_RELEASE_BASE:-}" ]]; then
  RELEASE_BASE="${CATLEX_RELEASE_BASE%/}"
  DOWNLOAD_URL="${RELEASE_BASE}/${ASSET_NAME}"
  CHECKSUMS_URL="${RELEASE_BASE}/SHA256SUMS"
elif [[ -n "${CATLEX_VERSION:-}" ]]; then
  VERSION="${CATLEX_VERSION#v}"
  RELEASE_BASE="https://github.com/${REPO}/releases/download/v${VERSION}"
  DOWNLOAD_URL="${RELEASE_BASE}/${ASSET_NAME}"
  CHECKSUMS_URL="${RELEASE_BASE}/SHA256SUMS"
else
  DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${ASSET_NAME}"
  CHECKSUMS_URL="https://github.com/${REPO}/releases/latest/download/SHA256SUMS"
fi

mkdir -p "${INSTALL_DIR}"

TMP_FILE="$(mktemp)"
CHECKSUMS_FILE="$(mktemp)"
trap 'rm -f "${TMP_FILE}" "${CHECKSUMS_FILE}"' EXIT

echo "Downloading catlex (${OS}/${ARCH}) from ${DOWNLOAD_URL}..."
curl -fsSL "${DOWNLOAD_URL}" -o "${TMP_FILE}"
chmod +x "${TMP_FILE}"

verify_checksum "${ASSET_NAME}" "${TMP_FILE}" "${CHECKSUMS_URL}" "${CHECKSUMS_FILE}"

mv "${TMP_FILE}" "${INSTALL_DIR}/${BINARY_NAME}"
trap 'rm -f "${CHECKSUMS_FILE}"' EXIT

echo "Installed ${INSTALL_DIR}/${BINARY_NAME}"

case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    echo
    echo "Warning: ${INSTALL_DIR} is not in your PATH."
    echo "Add this to your shell profile:"
    echo "  export PATH=\"\${HOME}/.local/bin:\${PATH}\""
    ;;
esac
