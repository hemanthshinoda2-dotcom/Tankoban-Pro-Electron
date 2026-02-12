# Bundled resources map

## Owns
- Runtime assets shipped with the app.
- MPV runtime path on Windows: `app/resources/mpv/windows/`.

## Git policy for MPV
- Large MPV binaries are not committed because GitHub blocks files over 100 MB.
- Use `scripts/windows/ensure_mpv_windows.bat` to download/extract MPV files.
- Build/run scripts call this helper automatically.

## Safe edit zones
- Keep resource paths stable. Main process and player code expect these exact locations.

## Danger zones
- Wrong MPV binaries can break playback or trigger antivirus false positives.

## Next links
- `docs/README.md`
- `docs/CODEMAP_INDEX.md`
- `docs/maps/`
