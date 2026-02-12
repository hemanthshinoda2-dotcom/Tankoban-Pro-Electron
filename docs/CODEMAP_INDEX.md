# Repository Code Map Index


NOTE: This repo line is Qt-only (detached Python/Qt player). Embedded mpv (native addon/canvas) folders were removed.
Every folder listed below contains a local `README.md` that explains what it owns and how to edit it safely.

Start with `docs/00_START_HERE.md` if you are new.

## Museum-level trace maps

If you want end-to-end “click → code → persistence” traces, start here:

- `docs/MUSEUM_TOUR.md`
- `docs/maps/README.md`
  - `docs/maps/MAP_LIBRARY_FLOW.md`
  - `docs/maps/MAP_READER_FLOW.md`
  - `docs/maps/MAP_VIDEO_FLOW.md`
  - `docs/maps/MAP_PLAYER_FLOW.md`
  - `docs/maps/MAP_PERSISTENCE_FLOW.md`


- [app/](../app/README.md)
  - [app/build/](../app/build/README.md)
  - [app/main/](../app/main/README.md)
    - [app/main/domains/](../app/main/domains/README.md)
      - [app/main/domains/archives/](../app/main/domains/archives/README.md)
      - [app/main/domains/clipboard/](../app/main/domains/clipboard/README.md)
      - [app/main/domains/comic/](../app/main/domains/comic/README.md)
      - [app/main/domains/export/](../app/main/domains/export/README.md)
      - [app/main/domains/files/](../app/main/domains/files/README.md)
      - [app/main/domains/library/](../app/main/domains/library/README.md)
      - [app/main/domains/player_core/](../app/main/domains/player_core/README.md)
      - [app/main/domains/progress/](../app/main/domains/progress/README.md)
      - [app/main/domains/seriesSettings/](../app/main/domains/seriesSettings/README.md)
      - [app/main/domains/shell/](../app/main/domains/shell/README.md)
      - [app/main/domains/thumbs/](../app/main/domains/thumbs/README.md)
      - [app/main/domains/video/](../app/main/domains/video/README.md)
      - [app/main/domains/videoProgress/](../app/main/domains/videoProgress/README.md)
      - [app/main/domains/videoSettings/](../app/main/domains/videoSettings/README.md)
      - [app/main/domains/videoUi/](../app/main/domains/videoUi/README.md)
      - [app/main/domains/window/](../app/main/domains/window/README.md)
    - [app/main/ipc/](../app/main/ipc/README.md)
    - [app/main/lib/](../app/main/lib/README.md)
  - [app/preload/](../app/preload/README.md)
  - [app/resources/](../app/resources/README.md)
  - [app/shared/](../app/shared/README.md)
  - [app/src/](../app/src/README.md)
    - [app/src/domains/](../app/src/domains/README.md)
      - [app/src/domains/library/](../app/src/domains/library/README.md)
      - [app/src/domains/player/](../app/src/domains/player/README.md)
      - [app/src/domains/reader/](../app/src/domains/reader/README.md)
      - [app/src/domains/shell/](../app/src/domains/shell/README.md)
      - [app/src/domains/video/](../app/src/domains/video/README.md)
    - [app/src/legacy/](../app/src/legacy/README.md)
      - [app/src/legacy/modules_shims/](../app/src/legacy/modules_shims/README.md)
        - [app/src/legacy/modules_shims/reader/](../app/src/legacy/modules_shims/reader/README.md)
    - [app/src/services/](../app/src/services/README.md)
      - [app/src/services/health/](../app/src/services/health/README.md)
    - [app/src/state/](../app/src/state/README.md)
    - [app/src/styles/](../app/src/styles/README.md)
  - [app/tools/](../app/tools/README.md)
  - [app/workers/](../app/workers/README.md)
- [docs/](../docs/README.md)
- [patches/](../patches/README.md)

- Work orders: `docs/13_WORK_ORDER_TEMPLATE.md`
