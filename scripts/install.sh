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
EXPECTED="$(awk -v asset="${ASSET_NAME}" '$2 == asset { print $1; count++ } END { if (count != 1) exit 1 }' "${TMP_DIR}/SHA256SUMS")" || {
  echo "Missing or ambiguous checksum for ${ASSET_NAME}" >&2
  exit 1
}
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

PATH_BLOCK_BEGIN="# >>> catlex PATH >>>"
PATH_BLOCK_END="# <<< catlex PATH <<<"

# Quote a value for a POSIX shell single-quoted string.
sh_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

# Quote a value for a fish single-quoted string.
fish_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e "s/'/\\\\'/g")"
}

# Print the startup file for the user's login shell, or nothing when unsupported.
startup_file() {
  case "$(basename "${SHELL:-}")" in
    zsh) echo "${ZDOTDIR:-${HOME}}/.zshrc" ;;
    bash)
      if [[ "${OS}" == "darwin" ]]; then
        echo "${HOME}/.bash_profile"
      else
        echo "${HOME}/.bashrc"
      fi
      ;;
    fish) echo "${XDG_CONFIG_HOME:-${HOME}/.config}/fish/conf.d/catlex.fish" ;;
  esac
}

path_block() {
  if [[ "$1" == *.fish ]]; then
    local dir
    dir="$(fish_quote "${INSTALL_DIR}")"
    printf '%s\nif not contains -- %s $PATH\n    set -gx PATH %s $PATH\nend\n%s\n' \
      "${PATH_BLOCK_BEGIN}" "${dir}" "${dir}" "${PATH_BLOCK_END}"
  else
    local dir
    dir="$(sh_quote "${INSTALL_DIR}")"
    printf '%s\ncase ":${PATH}:" in\n  *:%s:*) ;;\n  *) export PATH=%s":${PATH}" ;;\nesac\n%s\n' \
      "${PATH_BLOCK_BEGIN}" "${dir}" "${dir}" "${PATH_BLOCK_END}"
  fi
}

# Replace any previous catlex block so reinstalling never duplicates it.
write_path_block() {
  local file="$1" tmp
  mkdir -p "$(dirname "${file}")" || return 1
  tmp="${TMP_DIR}/startup-file"
  if [[ -e "${file}" ]]; then
    awk -v begin="${PATH_BLOCK_BEGIN}" -v end="${PATH_BLOCK_END}" '
      $0 == begin { skip = 1; next }
      skip && $0 == end { skip = 0; next }
      !skip { print }
    ' "${file}" >"${tmp}" || return 1
    if [[ -s "${tmp}" && -n "$(tail -c 1 "${tmp}")" ]]; then
      echo >>"${tmp}" || return 1
    fi
  else
    : >"${tmp}" || return 1
  fi
  path_block "${file}" >>"${tmp}" || return 1
  # Write through the existing file so symlinked dotfiles and permissions survive.
  cat "${tmp}" >"${file}" || return 1
}

print_manual_path_help() {
  echo "Run catlex with its full path: ${INSTALL_DIR}/${BINARY_NAME}"
  echo "Or add this to your shell startup file:"
  echo "  export PATH=$(sh_quote "${INSTALL_DIR}")\":\${PATH}\""
}

case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) exit 0 ;;
esac

echo
if [[ "${CATLEX_NO_MODIFY_PATH:-}" == "1" || -n "${CI:-}" ]]; then
  echo "Warning: ${INSTALL_DIR} is not in your PATH; leaving shell configuration unchanged."
  print_manual_path_help
  exit 0
fi

STARTUP_FILE="$(startup_file)"
if [[ -z "${STARTUP_FILE}" ]]; then
  echo "Warning: ${INSTALL_DIR} is not in your PATH, and shell '${SHELL:-unknown}' is not supported for automatic setup (bash, zsh, fish)."
  print_manual_path_help
  exit 0
fi

if ! write_path_block "${STARTUP_FILE}" 2>/dev/null; then
  echo "Warning: could not update ${STARTUP_FILE} to add ${INSTALL_DIR} to your PATH." >&2
  print_manual_path_help
  exit 0
fi

echo "Added ${INSTALL_DIR} to your PATH in ${STARTUP_FILE}."
echo "Open a new terminal (or terminal tab) to use catlex."
echo "To use it in this terminal right now, run:"
if [[ "${STARTUP_FILE}" == *.fish ]]; then
  echo "  set -gx PATH $(fish_quote "${INSTALL_DIR}") \$PATH"
else
  echo "  export PATH=$(sh_quote "${INSTALL_DIR}")\":\${PATH}\""
fi
