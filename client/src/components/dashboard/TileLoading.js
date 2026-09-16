import React from 'react';
import { Spinner } from 'react-bootstrap';

// Small in-tile loading state - the page-level `loading-container` spinner is too large to
// use inside a single grid tile.
function TileLoading() {
  return (
    <div className="d-flex align-items-center justify-content-center h-100">
      <Spinner animation="border" variant="light" style={{ width: 28, height: 28 }} />
    </div>
  );
}

export default TileLoading;
