# Code Style and Conventions

This is a practical list of conventions that keep edits safe and predictable.

## Folder boundaries

- `app/main/` may use Node.js APIs.
- `app/src/` must be browser-safe.
- `app/preload/` is the only place that should connect the two.

## Naming

- Prefer explicit names over short names.
- Keep Inter Process Communication channels as constants.

## Imports

- Shared constants go in `app/shared/`.
- Do not import renderer modules into main or preload.

## Changes

- One change should touch as few layers as possible.
- When a change must cross layers, update all layers in one commit.

## Editor delivery rules

When using an Artificial Intelligence editor, always ask for full file replacements for any file that changes.

