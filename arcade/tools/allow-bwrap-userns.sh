#!/usr/bin/env bash
# Lets bubblewrap (Codex's Linux sandbox) create user namespaces on Ubuntu 24.04, where AppArmor
# blocks unprivileged user namespaces by default. Only /usr/bin/bwrap gets the permission; the
# system-wide kernel.apparmor_restrict_unprivileged_userns setting is left alone.
# Usage: sudo ./allow-bwrap-userns.sh     Undo: sudo rm /etc/apparmor.d/bwrap && sudo systemctl reload apparmor
set -euo pipefail

PROFILE=/etc/apparmor.d/bwrap
BWRAP=/usr/bin/bwrap

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi
if [[ ! -x $BWRAP ]]; then
  echo "$BWRAP not found; install it with: apt install bubblewrap" >&2
  exit 1
fi
if [[ -e $PROFILE ]]; then
  echo "$PROFILE already exists; not overwriting. Contents:" >&2
  cat "$PROFILE" >&2
  exit 1
fi

cat >"$PROFILE" <<EOF
abi <abi/4.0>,
include <tunables/global>

profile bwrap $BWRAP flags=(unconfined) {
  userns,

  include if exists <local/bwrap>
}
EOF

apparmor_parser -r "$PROFILE"
echo "Loaded AppArmor profile $PROFILE"

# Verify as the invoking user, since that is who runs Codex.
TEST_USER=${SUDO_USER:-root}
if sudo -u "$TEST_USER" "$BWRAP" --ro-bind / / --unshare-user --unshare-pid -- /bin/true; then
  echo "OK: bwrap can create user namespaces for $TEST_USER"
else
  echo "bwrap still fails for $TEST_USER; check: journalctl -k | grep -i apparmor" >&2
  exit 1
fi
