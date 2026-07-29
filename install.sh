#!/usr/bin/env bash
#
# FamilyArchive installer (requires bash).
#
#   curl -fsSLO https://github.com/addison-moore/FamilyArchive/releases/latest/download/install.sh
#   bash install.sh
#
# Creates ./familyarchive/, downloads the release docker-compose.yml and .env
# template, generates secrets, starts the stack, and waits until the app
# answers. Requires Docker with the Compose v2 plugin. Prefer to see what it
# does first? It's short — read it, or run the manual steps from
# https://family-archive.net/docs/self-hosting/quickstart instead.
#
# For maintainers/testing: FAMILYARCHIVE_DOWNLOAD_BASE overrides the artifact
# URL base, and FAMILYARCHIVE_SKIP_PULL=1 skips `docker compose pull` so
# locally-built images can be used.

set -euo pipefail

REPO="addison-moore/FamilyArchive"

install_dir="./familyarchive"
app_port=""
pin_version=""

log() { printf '\033[1;36m[familyarchive]\033[0m %s\n' "$*"; }
fail() {
  printf '\033[1;31m[familyarchive]\033[0m %s\n' "$*" >&2
  exit 1
}

usage() {
  cat << 'EOF'
FamilyArchive installer.

Usage: bash install.sh [options]

Options:
  --dir DIR         install directory        (default: ./familyarchive)
  --port PORT       host port for the app    (default: 3000)
  --version X.Y.Z   pin a release, with or without the leading "v"
                    (default: the latest release)
  -h, --help        show this help

Downloads the release docker-compose.yml and .env template into the install
directory, generates AUTH_SECRET and a database password, starts the stack
with Docker Compose, and waits until the app answers.
EOF
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --dir)
        install_dir="${2:?--dir needs a value}"
        shift 2
        ;;
      --port)
        app_port="${2:?--port needs a value}"
        shift 2
        ;;
      --version)
        pin_version="${2:?--version needs a value}"
        pin_version="${pin_version#v}" # image tags have no leading v
        shift 2
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        fail "Unknown option: $1 (try --help)"
        ;;
    esac
  done

  # A pinned release must also use that release's compose file, not latest's.
  if [ -n "${FAMILYARCHIVE_DOWNLOAD_BASE:-}" ]; then
    download_base="${FAMILYARCHIVE_DOWNLOAD_BASE}"
  elif [ -n "${pin_version}" ]; then
    download_base="https://github.com/${REPO}/releases/download/v${pin_version}"
  else
    download_base="https://github.com/${REPO}/releases/latest/download"
  fi
}

preflight() {
  [ "$(id -u)" = "0" ] && log "Warning: running as root. The stack itself does not need root."
  command -v curl > /dev/null 2>&1 || fail "curl is required."
  command -v docker > /dev/null 2>&1 \
    || fail "Docker is required. Install it from https://docs.docker.com/engine/install/"
  docker compose version > /dev/null 2>&1 \
    || fail "The Docker Compose v2 plugin is required ('docker compose', not 'docker-compose'). See https://docs.docker.com/compose/install/"
  docker info > /dev/null 2>&1 \
    || fail "The Docker daemon is not reachable. Is Docker running, and does your user have permission to use it?"
}

setup_dir() {
  if [ -e "${install_dir}/docker-compose.yml" ]; then
    if [ -e "${install_dir}/.env" ]; then
      fail "${install_dir} already contains an install. To upgrade: cd ${install_dir} && docker compose pull && docker compose up -d"
    fi
    fail "${install_dir} has a docker-compose.yml but no .env — a previous install did not finish. Remove the directory (rm -rf ${install_dir}) and re-run."
  fi
  if [ -e "${install_dir}/.env" ]; then
    fail "${install_dir} already contains a .env; refusing to overwrite it. Use an empty directory (--dir)."
  fi
  mkdir -p "${install_dir}"
  cd "${install_dir}"

  # Compose derives the project (and volume) names from this directory's name.
  # Leftover volumes from an earlier install keep their OLD database password,
  # which a fresh .env cannot know — detect and stop rather than fail cryptically.
  local project
  project="$(basename "$PWD" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')"
  if docker volume ls --format '{{.Name}}' | grep -qx "${project}_postgres-data"; then
    fail "Found existing FamilyArchive data volumes for '${project}' (from a previous install in a directory of this name). Reuse them by restoring that install's .env, or start fresh with: docker volume rm ${project}_postgres-data ${project}_valkey-data ${project}_media-data  (DELETES that data)"
  fi
}

fetch() {
  # Atomic download: never leave a partial file behind.
  local url="$1" out="$2"
  curl -fsSL -o "${out}.tmp" "${url}" || {
    rm -f "${out}.tmp"
    return 1
  }
  mv "${out}.tmp" "${out}"
}

download_artifacts() {
  log "Downloading docker-compose.yml and .env template from ${download_base}"
  fetch "${download_base}/docker-compose.yml" docker-compose.yml \
    || fail "Could not download docker-compose.yml. No release published yet? See https://github.com/${REPO}/releases"
  fetch "${download_base}/example.env" example.env \
    || fail "Could not download example.env from ${download_base}"
}

random_base64() {
  openssl rand -base64 32 2> /dev/null || head -c 32 /dev/urandom | base64 | tr -d '\n'
}

random_hex() {
  openssl rand -hex 16 2> /dev/null || head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

write_env() {
  local auth_secret postgres_password
  auth_secret="$(random_base64)"
  postgres_password="$(random_hex)"
  umask 077
  # Secrets pass through the environment, not argv (argv is visible in `ps`).
  AUTH_SECRET_VALUE="${auth_secret}" POSTGRES_PASSWORD_VALUE="${postgres_password}" \
    awk '
      /^AUTH_SECRET=/       { print "AUTH_SECRET=" ENVIRON["AUTH_SECRET_VALUE"]; next }
      /^POSTGRES_PASSWORD=/ { print "POSTGRES_PASSWORD=" ENVIRON["POSTGRES_PASSWORD_VALUE"]; next }
      { print }
    ' example.env > .env
  rm example.env
  if [ -n "${app_port}" ]; then
    sed \
      -e "s|^#APP_PORT=.*|APP_PORT=${app_port}|" \
      -e "s|^#APP_URL=.*|APP_URL=http://localhost:${app_port}|" \
      .env > .env.tmp && mv .env.tmp .env
  fi
  if [ -n "${pin_version}" ]; then
    sed -e "s|^#FAMILYARCHIVE_VERSION=.*|FAMILYARCHIVE_VERSION=${pin_version}|" \
      .env > .env.tmp && mv .env.tmp .env
  fi
  chmod 600 .env
  log "Wrote .env with a generated AUTH_SECRET and database password."
}

start_stack() {
  if [ -z "${FAMILYARCHIVE_SKIP_PULL:-}" ]; then
    log "Pulling images (first run downloads a few hundred MB)…"
    docker compose pull
  fi
  log "Starting FamilyArchive…"
  docker compose up -d
}

effective_port() {
  # --port wins; else a caller-exported APP_PORT (compose reads it too); else 3000.
  echo "${app_port:-${APP_PORT:-3000}}"
}

wait_for_health() {
  local port attempts=90
  port="$(effective_port)"
  log "Waiting for the app to come up at http://localhost:${port} …"
  for _ in $(seq 1 "${attempts}"); do
    if curl -fsS --noproxy '*' --max-time 2 -o /dev/null "http://localhost:${port}/api/health" 2> /dev/null; then
      return 0
    fi
    sleep 2
  done
  fail "The app did not become healthy in time. Check: cd $(pwd) && docker compose logs app migrate worker"
}

finish() {
  local port
  port="$(effective_port)"
  log ""
  log "FamilyArchive is running."
  log ""
  log "  Open http://localhost:${port}/register to create the first account —"
  log "  it becomes the instance owner; everyone else joins via invites."
  log ""
  log "  Install directory: $(pwd) (config in .env)"
  log "  Media and database live in named Docker volumes."
  log "  Upgrade later:     docker compose pull && docker compose up -d"
  log "  Documentation:     https://family-archive.net/docs"
}

main() {
  parse_args "$@"
  preflight
  setup_dir
  download_artifacts
  write_env
  start_stack
  wait_for_health
  finish
}

main "$@"
