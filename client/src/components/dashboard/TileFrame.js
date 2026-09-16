import React from 'react';
import { Dropdown } from 'react-bootstrap';

// Common chrome around every tile's content: a header (which doubles as the react-grid-layout
// drag handle - see the `.tile-drag-handle` class, wired to `draggableHandle` in
// DashboardGrid.js) and a "..." menu for configuring/removing the tile.
function TileFrame({ title, onConfigure, onRemove, children }) {
  const menuId = React.useId();

  return (
    <div className="dashboard-tile">
      <div className="dashboard-tile-header tile-drag-handle">
        <span className="dashboard-tile-title">{title}</span>
        <Dropdown align="end" onMouseDown={(e) => e.stopPropagation()}>
          <Dropdown.Toggle as="button" id={menuId} bsPrefix="dashboard-tile-menu-toggle">⋮</Dropdown.Toggle>
          <Dropdown.Menu>
            {onConfigure && <Dropdown.Item onClick={onConfigure}>Configure</Dropdown.Item>}
            <Dropdown.Item onClick={onRemove} className="text-danger">Remove</Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>
      <div className="dashboard-tile-body">
        {children}
      </div>
    </div>
  );
}

export default TileFrame;
