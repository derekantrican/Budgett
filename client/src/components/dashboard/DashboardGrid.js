import React, { useCallback, useState } from 'react';
// react-grid-layout v2's native API: width is an explicit prop (measured via the
// useContainerWidth hook below) instead of the old WidthProvider HOC, drag-handle selection
// moves into `dragConfig`, and vertical compaction is the default `compactor` (no more
// `compactType` string prop) - see the package's README "What's New in v2" section.
import { ResponsiveGridLayout, useContainerWidth } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import TileFrame from './TileFrame';
import { getTileType } from './tileTypes';
import { updateDashboardTilesLayout } from '../../services/api';

const BREAKPOINTS = { lg: 992, xs: 0 };
const COLS = { lg: 12, xs: 1 };
const ROW_HEIGHT = 28;

// Renders every stored tile on a snap-to-grid layout. Desktop (`lg`) positions/sizes are
// persisted; the `xs` (mobile) breakpoint isn't supplied explicitly, so react-grid-layout
// auto-derives a single full-width column from the `lg` layout's (y, x) order - "flows
// vertically, full width" with no separate mobile layout to store or maintain.
function DashboardGrid({ tiles, ctx, onConfigure, onRemove }) {
  const { width, containerRef, mounted } = useContainerWidth();
  const [breakpoint, setBreakpoint] = useState('lg');
  // The `xs` breakpoint is the single-column, full-width mobile layout (see the file-level
  // comment) - dragging/resizing there would fight with that forced layout (and with touch
  // scrolling), so both are turned off outside `lg`.
  const isMobile = breakpoint !== 'lg';

  // Only tiles whose type still resolves (e.g. not an extension tile whose extension was
  // since removed) - layout items and rendered children must match 1:1, or react-grid-layout
  // errors looking for a DOM node it never got.
  const knownTiles = tiles.filter(t => getTileType(t.type, ctx));

  const layout = knownTiles.map(t => {
    const tt = getTileType(t.type, ctx);
    return { i: String(t.id), x: t.x, y: t.y, w: t.w, h: t.h, minW: tt.minW, minH: tt.minH };
  });

  // v2's onDragStop/onResizeStop keep the same "current full layout is the first argument"
  // shape as v1, so this only needed the rename away from a v1-specific type.
  const persistLayout = useCallback((currentLayout) => {
    if (breakpoint !== 'lg') {
      return;
    }

    updateDashboardTilesLayout(currentLayout.map(l => ({ id: Number(l.i), x: l.x, y: l.y, w: l.w, h: l.h })));
  }, [breakpoint]);

  return (
    <div ref={containerRef}>
      {mounted && (
        <ResponsiveGridLayout
          className="dashboard-grid"
          width={width}
          layouts={{ lg: layout }}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          margin={[16, 16]}
          dragConfig={{ handle: '.tile-drag-handle', enabled: !isMobile }}
          resizeConfig={{ enabled: !isMobile }}
          onBreakpointChange={setBreakpoint}
          onDragStop={persistLayout}
          onResizeStop={persistLayout}
        >
          {knownTiles.map(tile => {
            const tt = getTileType(tile.type, ctx);
            const TileComponent = tt.Component;
            return (
              <div key={tile.id}>
                <TileFrame
                  title={tile.config?.title || tt.label}
                  onConfigure={() => onConfigure(tile, tt)}
                  onRemove={() => onRemove(tile)}
                >
                  <TileComponent ctx={ctx} config={tile.config || {}} />
                </TileFrame>
              </div>
            );
          })}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}

export default DashboardGrid;
