# Docs Cleanup Report (Build 82)

Goal: leave one crisp, current doc set (the "source of truth") and remove historical build diaries, duplicated guides, and archive-only notes.

## Kept Markdown files

- app/START_HERE.md
- app/ARCHITECTURE_RULES.md
- app/CHANGE_LOCATOR.md
- app/TESTING_GOLDEN_PATHS.md
- app/RESTRUCTURE_REPORT.md
- app/DOCS_CLEANUP_REPORT.md

Optional native build notes (kept as-is):

- app/native/libmpv_bridge/README.md
- app/native/libmpv_bridge/RENDER_TARGET_NOTES.md

## Notes migrated into the core docs

- Manual regression steps from previous "smoke/manual tests" docs were condensed into **app/TESTING_GOLDEN_PATHS.md**.
- "Where do I change this?" guidance was replaced with **app/CHANGE_LOCATOR.md**.
- The enforced invariants + how smoke checks them are now in **app/ARCHITECTURE_RULES.md**.

## Deleted Markdown files

The following .md files were removed as redundant history, build diaries, or duplicated guides:
- BUILD71_PERFORMANCE_FINDINGS.md
- BUILD71_README.md
- BUILD71_WHAT_CHANGED.md
- BUILD72_FIX_NOTES.md
- BUILD72_SUMMARY.md
- BUILD73_FIX_NOTES.md
- BUILD73_SUMMARY.md
- BUILD74_FIX_NOTES.md
- BUILD_65_IMPLEMENTATION.md
- BUILD_65_USER_GUIDE.md
- BUILD_68_FIXES.md
- BUILD_68_SUMMARY.md
- BUILD_68_TESTING_GUIDE.md
- BUILD_69_FINAL_IMPLEMENTATION.md
- BUILD_69_IMPLEMENTATION.md
- BUILD_78A_SUMMARY.md
- BUILD_78B_SUMMARY.md
- PATCH_NOTES.md
- PATCH_NOTES_BUILD_65.md
- PATCH_NOTES_BUILD_68.md
- README_BUILD_68.md
- app/BUILD_HISTORY.md
- app/BUILD_HISTORY.orig.md
- app/CHANGELOG.md
- app/CHANGELOG.orig.md
- app/CONTRIBUTING_AI.md
- app/EMBED_TRACK.md
- app/INSTRUCTIONS.md
- app/PATCH_NOTES.md
- app/PHASE_1_DONE.md
- app/PHASE_2_DONE.md
- app/PHASE_3_DONE.md
- app/PHASE_4A_DONE.md
- app/PHASE_4B_DONE.md
- app/PHASE_4C_DONE.md
- app/PHASE_4D_DONE.md
- app/PHASE_5_DONE.md
- app/PHASE_6_DONE.md
- app/PHASE_7_DONE.md
- app/PROJECT_MAP.md
- app/README.md
- app/SMOKE_TEST.md
- app/docs/EMBEDDED_MPV_PLAN.md
- app/docs/EMBED_MPV_BUILD26.md
- app/docs/EMBED_MPV_BUILD27.md
- app/docs/EMBED_MPV_BUILD29.md
- app/docs/EMBED_MPV_BUILD30.md
- app/docs/EMBED_MPV_ROADMAP.md
- app/docs/ISSUE_INDEX.md
- app/docs/MANUAL_TESTS_GOLDEN_PATHS.md
- app/docs/STATE_AND_STORAGE.md
- app/docs/SUPPORTED_MODES.md
- app/docs/USER_INTERFACE_SURFACES.md
- app/docs/WHERE_DO_I_CHANGE_THIS.md
- app/docs/WORK_ORDER_TEMPLATE.md
- app/docs/archive/LEGACY_AI_NOTES.md
- app/docs/archive/LEGACY_CONTRIBUTING_AI.md
- app/docs/archive/LEGACY_PORT_SUMMARY.md
- app/docs/archive/LEGACY_PROJECT_MAP.md
- app/docs/issues/continue_thumbs_shrinking.md
- app/docs/issues/progress_resume_inconsistent.md
- app/docs/issues/subtitle_audio_prefs_not_saved.md
- app/docs/issues/video_sidebar_styling_mismatch.md
- tankoban-script-responsibility-map.md
