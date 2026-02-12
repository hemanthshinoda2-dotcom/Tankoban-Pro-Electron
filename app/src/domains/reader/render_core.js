// Build 9: moved from src/modules/reader_20_viewport.js into src/modules/reader/*
// NOTE: Mechanical split. Logic is unchanged.
function drawActiveFrame(bmp, spread) {
  if (!bmp) return;
  const mode = getControlMode();

  // FIND_THIS:HOTSPOT_TWO_PAGE_SCROLL_RENDER_BRANCH (Tankoban Build 2)
  if (isTwoPageScrollMode(mode)) {
    drawTwoPageScrollStackedRows(bmp);
    return;
  }

  // FIND_THIS:HOTSPOT_TWO_PAGE_FLIP_RENDER_BRANCH (Tankoban Build 2)
  if (isTwoPageFlipMode(mode) || mode === 'autoFlip') {
    drawTwoPageFrame(bmp);
    return;
  }
  if (spread) return drawFrame(bmp, true);
  if (isSinglePageMode()) return drawSinglePageFrame(bmp);
  return drawFrame(bmp, false);
}


  // === STATE MACHINE ===
