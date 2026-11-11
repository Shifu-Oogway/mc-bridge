#!/usr/bin/env bash
# Reach a mc-bridge game running on ANOTHER computer (Windows or Linux, over SSH) as if it ran here.
#
# The mod listens on the other machine's 127.0.0.1 only, on a random port, with a token. This script opens an SSH tunnel
# to that port and writes a matching mcbridge/connection.json into a local "instance" folder that index.js already scans
# (~/curseforge/minecraft/Instances/<name>/), so ollama-agent.js, --teacher mode and the MCP server just work.
#
#   ./connect-remote.sh user@B "C:\Users\me\curseforge\minecraft\Instances\Create Pack"   # connect (asks for the SSH password once)
#   ./connect-remote.sh --stop                                                           # close the tunnel, remove the local file
#
# Run it again whenever the game on the other machine is (re)started: the port changes every launch.
# Then use e.g.:  node ollama-agent.js --teacher --instance remote --plan plans/create-millstone.json
# (--instance remote is only required if a local game is running too; the instance is named after NAME below).
#
# Options via environment: NAME (local instance name, default "remote"), LOCAL_PORT (default 25600), REMOTE_OS (windows|linux,
# default windows; windows uses `type` and backslash paths, linux uses `cat`).
# Needs: ssh (OpenSSH server on the other machine), node, curl. Key-based SSH login avoids the password prompt.
set -euo pipefail

NAME="${NAME:-remote}"
LOCAL_PORT="${LOCAL_PORT:-25600}"
REMOTE_OS="${REMOTE_OS:-windows}"
STATE="${XDG_CACHE_HOME:-$HOME/.cache}/mc-bridge"
SOCK="$STATE/ssh-$NAME.sock"
LOCAL_DIR="$HOME/curseforge/minecraft/Instances/$NAME"

stop_tunnel() {
  if [ -S "$SOCK" ]; then ssh -S "$SOCK" -O exit placeholder >/dev/null 2>&1 || true; fi
  rm -f "$SOCK"
}

if [ "${1:-}" = "--stop" ]; then
  stop_tunnel
  rm -f "$LOCAL_DIR/mcbridge/connection.json"
  echo "tunnel closed, local connection file removed"
  exit 0
fi

if [ $# -lt 2 ]; then
  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi
HOST="$1"
GAME_DIR="$2"

mkdir -p "$STATE"
stop_tunnel   # a previous run's tunnel points at a dead port

if (exec 3<>"/dev/tcp/127.0.0.1/$LOCAL_PORT") 2>/dev/null; then
  echo "local port $LOCAL_PORT is already in use; pick another with LOCAL_PORT=..." >&2
  exit 1
fi

# One SSH connection, reused for everything below, so a password is only asked once.
ssh -M -S "$SOCK" -f -N -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes "$HOST"

cleanup_on_error() { stop_tunnel; }
trap cleanup_on_error ERR

if [ "$REMOTE_OS" = "windows" ]; then
  WIN_PATH="${GAME_DIR//\//\\}"
  READ_CMD="type \"${WIN_PATH%\\}\\mcbridge\\connection.json\""
else
  READ_CMD="cat '${GAME_DIR%/}/mcbridge/connection.json'"
fi

if ! REMOTE_JSON="$(ssh -S "$SOCK" "$HOST" "$READ_CMD" 2>&1)"; then
  echo "could not read connection.json on $HOST: $REMOTE_JSON" >&2
  echo "Is the game running with the mc-bridge mod, and is the instance folder correct?" >&2
  stop_tunnel; exit 1
fi

# Parse with node (already required by this project). Prints: <port> <token>
read -r REMOTE_PORT TOKEN < <(printf '%s' "$REMOTE_JSON" | node -e '
  let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
    try { const j=JSON.parse(s); if(!j.port||!j.token) throw 0; console.log(j.port, j.token); }
    catch { console.error("connection.json on the other machine is not valid: "+s.slice(0,200)); process.exit(1); }
  });') || { stop_tunnel; exit 1; }

ssh -S "$SOCK" -O forward -L "127.0.0.1:$LOCAL_PORT:127.0.0.1:$REMOTE_PORT" "$HOST"

mkdir -p "$LOCAL_DIR/mcbridge"
printf '{\n  "host": "127.0.0.1",\n  "port": %s,\n  "token": "%s"\n}\n' "$LOCAL_PORT" "$TOKEN" > "$LOCAL_DIR/mcbridge/connection.json"
chmod 600 "$LOCAL_DIR/mcbridge/connection.json"

echo "tunnel: 127.0.0.1:$LOCAL_PORT -> $HOST 127.0.0.1:$REMOTE_PORT"
if HELLO="$(curl -fsS --max-time 5 -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$LOCAL_PORT/hello" 2>&1)"; then
  echo "bridge answered: $HELLO"
  echo "ready: instance \"$NAME\" ($LOCAL_DIR). Stop with: $0 --stop"
else
  echo "tunnel is up but the bridge did not answer ($HELLO)." >&2
  echo "The game may have restarted since connection.json was written; rerun this script." >&2
  exit 1
fi
