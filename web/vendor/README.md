# binjgb runtime

Upstream: https://github.com/binji/binjgb
Pinned commit: c60e138da5a795ebb55e56b11b7e90024e41112c
License: MIT, included in LICENSE.binjgb.

`binjgb.js` is the upstream `docs/binjgb.js` build, unchanged.
`binjgb-wasm.js` contains upstream `docs/binjgb.wasm` encoded as base64 so the player opens directly using file:// without a fetch or server.
No game ROM or extracted game asset is included. Our player wrapper is `../rom/player.js`; it uses the exported C interface. Emulator state files are tied to this runtime and the exact ROM SHA-256.

Build checksums (SHA-256):

- binjgb.js: `a68e5854b5d68339a34c0aa0b6dbeacd615ed316657ee17b63dafa5e00561b09`
- binjgb.wasm: `52c165069441a09180b4bd63464318aa7b861b1d36e0d05e8047b48619fd2f0b`
