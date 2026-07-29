#!/usr/bin/env bash
set -euo pipefail

REPO="mtm-LazumLyntonTawngYung/metateam-code-agent"
BIN_DIR="${MTC_INSTALL_DIR:-/usr/local/bin}"

detect_platform() {
  local os arch target

  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    *)      echo "Unsupported OS: $(uname -s)"; exit 1 ;;
  esac

  case "$(uname -m)" in
    arm64|aarch64) arch="arm64" ;;
    x86_64|amd64)  arch="x64" ;;
    *)             echo "Unsupported arch: $(uname -m)"; exit 1 ;;
  esac

  echo "bun-${os}-${arch}"
}

main() {
  local target
  target=$(detect_platform)

  echo "Fetching latest release of mtc for ${target}..."

  local release_url
  release_url=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep "browser_download_url" \
    | grep "${target}" \
    | cut -d '"' -f 4 \
    | head -1)

  if [ -z "$release_url" ]; then
    echo "Error: Could not find binary for ${target}"
    exit 1
  fi

  echo "Downloading ${release_url}..."

  if [ ! -d "$BIN_DIR" ]; then
    mkdir -p "$BIN_DIR"
  fi

  if [ ! -w "$BIN_DIR" ]; then
    curl -fsSL "$release_url" -o /tmp/mtc
    chmod +x /tmp/mtc
    if command -v sudo &>/dev/null; then
      sudo mv /tmp/mtc "${BIN_DIR}/mtc"
    else
      echo "Error: Cannot write to ${BIN_DIR}. Run as root or set MTC_INSTALL_DIR=~/.local/bin"
      exit 1
    fi
  else
    curl -fsSL "$release_url" -o "${BIN_DIR}/mtc"
    chmod +x "${BIN_DIR}/mtc"
  fi

  echo "mtc installed successfully at ${BIN_DIR}/mtc"
  echo "Make sure ${BIN_DIR} is in your PATH."
}

main
