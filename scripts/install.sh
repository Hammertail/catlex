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
mkdir -p -- "${INSTALL_DIR}"
# Store an absolute path in startup files, even for a relative CATLEX_INSTALL_DIR.
INSTALL_DIR="$(CDPATH='' cd -- "${INSTALL_DIR}" && pwd)"
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

# Succeed when the current PATH already has the install directory (ignoring trailing slashes).
path_has_install_dir() {
  local entry entries
  IFS=: read -r -a entries <<<"${PATH}"
  for entry in "${entries[@]}"; do
    while [[ "${entry}" == ?*/ ]]; do entry="${entry%/}"; done
    [[ "${entry}" == "${INSTALL_DIR}" ]] && return 0
  done
  return 1
}

# Print the Bash startup file: ~/.bashrc on Linux; on macOS, the login file Bash
# actually reads (the first of .bash_profile, .bash_login, .profile), so creating
# a new ~/.bash_profile never stops an existing ~/.profile from loading.
bash_startup_file() {
  local name
  if [[ "${OS}" != "darwin" ]]; then
    echo "${HOME}/.bashrc"
    return
  fi
  for name in .bash_profile .bash_login .profile; do
    if [[ -e "${HOME}/${name}" ]]; then
      echo "${HOME}/${name}"
      return
    fi
  done
  echo "${HOME}/.bash_profile"
}

zsh_startup_file() { echo "${ZDOTDIR:-${HOME}}/.zshrc"; }

fish_config_dir() { echo "${XDG_CONFIG_HOME:-${HOME}/.config}/fish"; }

# Print the startup file for the user's login shell, or nothing when unsupported.
login_shell_startup_file() {
  case "$(basename "${SHELL:-}")" in
    zsh) zsh_startup_file ;;
    bash) bash_startup_file ;;
    fish) echo "$(fish_config_dir)/conf.d/catlex.fish" ;;
  esac
}

# Print every startup file to configure, one per line: the login shell's file,
# plus those of other supported shells the user already has set up, so a terminal
# that runs a different shell (for example Bash in VS Code) also finds catlex.
startup_files() {
  local primary file
  primary="$(login_shell_startup_file)"
  [[ -n "${primary}" ]] && echo "${primary}"
  for file in "$(bash_startup_file)" "$(zsh_startup_file)"; do
    [[ "${file}" != "${primary}" && -f "${file}" ]] && echo "${file}"
  done
  file="$(fish_config_dir)/conf.d/catlex.fish"
  if [[ "${file}" != "${primary}" && -d "$(fish_config_dir)" ]]; then
    echo "${file}"
  fi
  return 0
}

path_block() {
  local dir
  if [[ "$1" == *.fish ]]; then
    dir="$(fish_quote "${INSTALL_DIR}")"
    printf '%s\nif not contains -- %s $PATH; and not contains -- %s/ $PATH\n    set -gx PATH %s $PATH\nend\n%s\n' \
      "${PATH_BLOCK_BEGIN}" "${dir}" "${dir}" "${dir}" "${PATH_BLOCK_END}"
  else
    dir="$(sh_quote "${INSTALL_DIR}")"
    # Treat "<dir>/" on PATH as already present, like path_has_install_dir does.
    printf '%s\ncase ":${PATH}:" in\n  *:%s:* | *:%s/:*) ;;\n  *) export PATH=%s":${PATH}" ;;\nesac\n%s\n' \
      "${PATH_BLOCK_BEGIN}" "${dir}" "${dir}" "${dir}" "${PATH_BLOCK_END}"
  fi
}

# Add the catlex block to a startup file, or replace the existing one in place.
# Sets PATH_FILE_RESULT to "added" or "unchanged". On failure it returns 1, and
# PATH_FILE_ERROR may explain why.
ensure_path_block() {
  local file="$1" block="${TMP_DIR}/path-block" updated="${TMP_DIR}/startup-file" backup status=0
  PATH_FILE_ERROR=""
  mkdir -p -- "$(dirname -- "${file}")" || return 1
  path_block "${file}" >"${block}" || return 1

  if [[ ! -e "${file}" ]]; then
    cat "${block}" >"${file}" || return 1
    PATH_FILE_RESULT="added"
    return 0
  fi

  if ! grep -qxF -- "${PATH_BLOCK_BEGIN}" "${file}"; then
    # Appending never truncates the file, so its content is safe even if the write fails.
    {
      if [[ -s "${file}" && -n "$(tail -c 1 -- "${file}")" ]]; then echo; fi
      cat "${block}"
    } >>"${file}" || return 1
    PATH_FILE_RESULT="added"
    return 0
  fi

  # Replace the first block where it is and drop any extra copies.
  awk -v begin="${PATH_BLOCK_BEGIN}" -v end="${PATH_BLOCK_END}" -v block="${block}" '
    $0 == begin {
      if (!replaced) { while ((getline line < block) > 0) print line; replaced = 1 }
      skip = 1
      next
    }
    skip && $0 == end { skip = 0; next }
    !skip { print }
    END { if (skip) exit 3 }
  ' "${file}" >"${updated}" || status=$?
  if [[ "${status}" -eq 3 ]]; then
    PATH_FILE_ERROR="it has a '${PATH_BLOCK_BEGIN}' line without a matching '${PATH_BLOCK_END}' line. Fix or remove that block, then run the installer again."
    return 1
  fi
  [[ "${status}" -eq 0 ]] || return 1

  if cmp -s -- "${updated}" "${file}"; then
    PATH_FILE_RESULT="unchanged"
    return 0
  fi
  # Write through the existing file so symlinked dotfiles and permissions survive,
  # keeping a backup in case the write is interrupted.
  backup="${file}.catlex-backup"
  cp -p -- "${file}" "${backup}" || return 1
  if ! cat "${updated}" >"${file}"; then
    PATH_FILE_ERROR="the original file was saved to ${backup}."
    return 1
  fi
  rm -f -- "${backup}"
  PATH_FILE_RESULT="added"
}

print_export_hint() {
  echo "  export PATH=$(sh_quote "${INSTALL_DIR}")\":\${PATH}\""
}

print_manual_path_help() {
  echo "Run catlex with its full path: ${INSTALL_DIR}/${BINARY_NAME}"
  echo "Or add this to your shell startup file:"
  print_export_hint
}

if [[ "${CATLEX_NO_MODIFY_PATH:-}" == "1" || -n "${CI:-}" ]]; then
  if ! path_has_install_dir; then
    echo
    echo "Warning: ${INSTALL_DIR} is not in your PATH; leaving shell configuration unchanged."
    print_manual_path_help
  fi
  exit 0
fi

UPDATED_FILES=()
CONFIGURED=0
FAILED=0
while IFS= read -r STARTUP_FILE; do
  if ensure_path_block "${STARTUP_FILE}" 2>/dev/null; then
    CONFIGURED=1
    [[ "${PATH_FILE_RESULT}" == "added" ]] && UPDATED_FILES+=("${STARTUP_FILE}")
  else
    FAILED=1
    echo >&2
    echo "Warning: could not update ${STARTUP_FILE} to add ${INSTALL_DIR} to your PATH${PATH_FILE_ERROR:+: ${PATH_FILE_ERROR}}" >&2
  fi
done < <(startup_files)

if [[ "${#UPDATED_FILES[@]}" -gt 0 ]]; then
  echo
  for STARTUP_FILE in "${UPDATED_FILES[@]}"; do
    echo "Added ${INSTALL_DIR} to your PATH in ${STARTUP_FILE}."
  done
fi

if [[ -z "$(login_shell_startup_file)" ]]; then
  if ! path_has_install_dir; then
    echo
    echo "Warning: shell '${SHELL:-unknown}' is not supported for automatic PATH setup (bash, zsh, fish)."
    print_manual_path_help
  fi
elif [[ "${FAILED}" -eq 1 ]]; then
  print_manual_path_help
fi

if [[ "${CONFIGURED}" -eq 1 ]] && ! path_has_install_dir; then
  [[ "${#UPDATED_FILES[@]}" -gt 0 ]] || echo
  echo "Open a new terminal (or terminal tab) to use catlex."
  echo "To use it in this terminal right now, run:"
  if [[ "$(login_shell_startup_file)" == *.fish ]]; then
    echo "  set -gx PATH $(fish_quote "${INSTALL_DIR}") \$PATH"
  else
    print_export_hint
  fi
fi
