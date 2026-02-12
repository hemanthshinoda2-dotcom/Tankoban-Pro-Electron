# Tankoban Pro — Museum Tour

If you want to understand the whole app like a maintainer (not like a visitor), follow this path:

1) Read `docs/00_START_HERE.md` for the mental model + “where to touch what”.
2) Skim `docs/01_ARCHITECTURE_OVERVIEW.md` for the process layout (Main / Preload / Renderer / Workers).
3) Then pick the domain you’re changing and open the matching “trace map” in `docs/maps/`.

## The five trace maps (click → data → persistence)

- `docs/maps/MAP_LIBRARY_FLOW.md` — Comics library: import/scan → tiles → open reader → progress
- `docs/maps/MAP_READER_FLOW.md` — Comic reader: open volume → state → overlays → progress save
- `docs/maps/MAP_VIDEO_FLOW.md` — Video library: root/show/episodes → play → progress save/resume
- `docs/maps/MAP_PLAYER_FLOW.md` — Player wiring: HTML video vs mpv host, capabilities, fullscreen, detach
- `docs/maps/MAP_PERSISTENCE_FLOW.md` — Where state lives: JSON stores, caches, progress stores, settings

## Editing rule

When you change behavior:
- Update the **map** for that domain first (what changed and why).
- Then update the implementation.
- Then run the “golden paths” in `app/TESTING_GOLDEN_PATHS.md`.

That keeps the repo “museum-level”: the documentation always matches the real system.
