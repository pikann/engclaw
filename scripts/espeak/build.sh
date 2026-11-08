#!/usr/bin/env bash
# Builds a self-contained espeak-ng (static, no audio/mbrola/sonic) from the pinned release and
# stages it at apps/desktop/resources/espeak-ng/{espeak-ng[.exe],espeak-ng-data/} for electron-builder.
# Needs cmake + a C compiler (+ ninja or make). On Windows run it from an MSYS2 MINGW64 shell.
set -euo pipefail

VERSION=1.52.0
SHA256=bb4338102ff3b49a81423da8a1a158b420124b055b60fa76cfb4b18677130a23
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/apps/desktop/resources/espeak-ng"
WORK="${ESPEAK_WORKDIR:-$(mktemp -d)}"

if [[ -x "$OUT/espeak-ng" || -x "$OUT/espeak-ng.exe" ]] && [[ -d "$OUT/espeak-ng-data" ]] && [[ "${FORCE:-}" != 1 ]]; then
  echo "espeak-ng already staged in $OUT (FORCE=1 to rebuild)"; exit 0
fi

mkdir -p "$WORK"
curl -fsSL "https://github.com/espeak-ng/espeak-ng/archive/refs/tags/$VERSION.tar.gz" -o "$WORK/src.tgz"
if command -v sha256sum >/dev/null; then ACTUAL="$(sha256sum "$WORK/src.tgz" | cut -d' ' -f1)"
else ACTUAL="$(shasum -a 256 "$WORK/src.tgz" | cut -d' ' -f1)"; fi
[[ "$ACTUAL" == "$SHA256" ]] || { echo "espeak-ng source checksum mismatch: $ACTUAL" >&2; exit 1; }
tar -xzf "$WORK/src.tgz" -C "$WORK"
SRC="$WORK/espeak-ng-$VERSION"

EXTRA=()
case "$(uname -s)" in
  MINGW*|MSYS*) EXTRA+=(-G Ninja -DCMAKE_EXE_LINKER_FLAGS=-static) ;;
  Darwin) EXTRA+=(-DCMAKE_OSX_DEPLOYMENT_TARGET=12.0) ;;
esac

cmake -S "$SRC" -B "$WORK/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
  -DUSE_ASYNC=OFF -DUSE_MBROLA=OFF -DUSE_LIBSONIC=OFF -DUSE_LIBPCAUDIO=OFF -DUSE_SPEECHPLAYER=OFF \
  -DCMAKE_INSTALL_PREFIX="$WORK/install" "${EXTRA[@]}"
cmake --build "$WORK/build" --config Release -j 4
cmake --install "$WORK/build" --config Release

rm -rf "$OUT" && mkdir -p "$OUT"
cp "$WORK/install/bin/espeak-ng"* "$OUT/"
cp -R "$WORK/install/share/espeak-ng-data" "$OUT/espeak-ng-data"
cp "$SRC/COPYING" "$OUT/COPYING"
echo "staged $OUT"; ls "$OUT"
