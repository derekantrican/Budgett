import React, { useEffect, useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { TileTitleField } from './configForms';

// Reopens a tile's config form (from TileFrame's "Configure" menu item) to change its
// settings after it's already on the grid - e.g. picking different accounts for a balances
// table. Always includes TileTitleField (the title override) at the top, even for tile types
// with no settings of their own.
function ConfigureTileModal({ show, tile, tileType, ctx, onSave, onClose }) {
  const [config, setConfig] = useState(tile?.config || {});

  useEffect(() => {
    setConfig(tile?.config || {});
  }, [tile]);

  if (!tile || !tileType) {
    return null;
  }

  const handleChange = (patch) => setConfig(c => ({ ...c, ...patch }));

  return (
    <Modal show={show} onHide={onClose} data-bs-theme="dark" size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Configure: {tileType.label}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <TileTitleField config={config} defaultLabel={tileType.label} onChange={handleChange} />
        {tileType.ConfigForm && <tileType.ConfigForm ctx={ctx} config={config} onChange={handleChange} />}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => onSave(tile, config)}>Save</Button>
      </Modal.Footer>
    </Modal>
  );
}

export default ConfigureTileModal;
