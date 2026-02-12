# Tankoban Pro Electron

Tankoban Pro Electron is a **Windows-first desktop app** for managing and reading manga/comic archives and video libraries.

## Use prebuilt release (recommended)

If you only want to run the app, use the packaged release instead of building locally.

1. Go to the project Releases page and download the latest Windows release asset.
2. Extract the package to a normal user-writable folder (for example: `C:\Apps\TankobanPro`).
3. Run the packaged executable.

For user-focused install notes, see the [User Release Guide](docs/USER_RELEASE_GUIDE.md).

## Build from source

If you want to develop, debug, or package custom builds, use the contributor setup:

- [CONTRIBUTING.md](CONTRIBUTING.md) (source build + dev workflow)
- [Documentation Index](docs/README.md) (architecture and internal documentation)

## Support scope

This project is currently scoped for **Windows only**.

- **Supported OS:** Windows 10 and Windows 11.
- **Actively tested on:** Windows 11 developer environments.
- **Known limitations:**
  - Linux and macOS are not officially supported.
  - Build and runtime helper scripts are batch/PowerShell-first.
  - Some flows assume local Windows media tooling behavior.

## Audience quick links

- End users: [User Release Guide](docs/USER_RELEASE_GUIDE.md)
- Contributors/developers: [CONTRIBUTING.md](CONTRIBUTING.md)
- Architecture deep dive: [Documentation Index](docs/README.md)
