# IPC Register Modules

This folder contains grouped IPC registrations.

- Each file exports: `register({ ipcMain, CHANNEL, ctx, domains })`
- `ipcMain.handle/on` is allowed in this folder.
- `app/main/ipc/index.js` is the orchestrator (builds ctx, imports domains, calls these modules).

If you add a new group:
1) Create a new file here.
2) Add it to the `registerModules` list in `app/main/ipc/index.js`.
3) Run `npm run smoke`.
