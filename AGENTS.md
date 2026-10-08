# Designmon ROM research

- Read README.md and docs/ROM_RESEARCH.md. Current phase: original Korean Gold running in SameBoy WASM, complete byte-preserving source rebuilds and local editors. Read docs/GAME_CONTEXT.md for the recovered design and implementation limits.
- The original Gold player/editor lives in web/gold/. The earlier independent chapter remains in web/. Core/data/DOM checks run with npm test; set GOLD_ROM to an external input for actual game tests. The old prototype is preserved in legacy/index.html. Rebuild the standalone root index.html with python3 tools/build-standalone.py after changing web/gold or runtime sources. Private ROM/source embeddings must be written outside the repository. The ROM lab lives in tools/rom-lab and opens as a local index.html without a server.
- Never modify an input ROM in place. Gate writes on the known SHA-256 and expected bytes. Recompute checksums, emit a manifest and verify IPS round trips.
- Keep original/modified ROMs, extracted assets, emulator saves, screenshots and debugger output outside the repository. Publish the tools and concise findings only.
- Do not transfer English ROM offsets or unverified symbol addresses to Korean ROM patches. Label source-derived candidates separately from runtime evidence.
- Python checks: `python3 -m unittest discover -s tests -v`. Optional emulator/browser checks are documented in README.md.
- Keep executable test probes separate from shipped ROM patches. A debugger-rendered name screen is not a naturally reachable game scene.
