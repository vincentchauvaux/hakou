#!/bin/sh
# Copie le monde 3D (même commit) dans studio/public pour l’origine studio.hakou.be.
set -e
root="$(cd "$(dirname "$0")/../.." && pwd)"
dest="$root/studio/public"
cp "$root/scene3d.js" "$root/solar-plexus.js" "$dest/"
echo "sync-world → $dest/scene3d.js $dest/solar-plexus.js"
