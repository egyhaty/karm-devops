#!/usr/bin/env bash
# Format only a verified new, blank 80 GiB disk identified by its unique serial.
set -euo pipefail
: "${DISK_SERIAL:?Set the unique Proxmox disk serial}"
[[ $EUID -eq 0 ]] || { echo 'Run as root' >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=l
apt-get update -qq
apt-get install -y -qq open-iscsi nfs-common cryptsetup dmsetup age
modprobe iscsi_tcp
printf 'iscsi_tcp\n' > /etc/modules-load.d/karm-storage.conf
systemctl enable --now iscsid
if command -v multipath >/dev/null; then
  [[ -z $(multipath -ll) ]] || { echo 'Existing multipath devices require manual review' >&2; exit 1; }
  systemctl disable --now multipathd.service multipathd.socket
fi
mapfile -t devices < <(lsblk -dnpo NAME,SERIAL | awk -v serial="$DISK_SERIAL" '$2 == serial {print $1}')
[[ ${#devices[@]} -eq 1 ]] || { echo 'Disk serial must identify exactly one device' >&2; exit 1; }
device=${devices[0]}
[[ $(blockdev --getsize64 "$device") -eq 85899345920 ]] || { echo 'Unexpected disk size' >&2; exit 1; }
mkdir -p /var/lib/longhorn
if mountpoint -q /var/lib/longhorn; then
  [[ $(findmnt -nro SOURCE /var/lib/longhorn) == "$device" ]] || { echo 'Unexpected mounted device' >&2; exit 1; }
else
  [[ -z $(wipefs --no-act --noheadings "$device") ]] || { echo 'Refusing to format a disk with existing signatures' >&2; exit 1; }
  [[ $(lsblk -n "$device" | wc -l) -eq 1 ]] || { echo 'Refusing a partitioned disk' >&2; exit 1; }
  mkfs.ext4 -q -L karm-longhorn "$device"
  disk_uuid=$(blkid -s UUID -o value "$device")
  printf 'UUID=%s /var/lib/longhorn ext4 defaults,noatime 0 2\n' "$disk_uuid" >> /etc/fstab
  systemctl daemon-reload
  mount /var/lib/longhorn
fi
findmnt /var/lib/longhorn
systemctl is-active iscsid
