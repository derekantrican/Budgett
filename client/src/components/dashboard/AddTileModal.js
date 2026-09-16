import React, { useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { getTileTypes } from './tileTypes';
import { TileTitleField } from './configForms';

// Picker modeled directly on Planning's AddViewModal: a card grid of tile types, then a config
// step before the tile is actually created - every type gets at least the title override
// (TileTitleField) there, plus whatever type-specific settings it has (e.g. which accounts go
// in a balances table).
function AddTileModal({ show, onClose, onAdd, ctx }) {
  const [selectedType, setSelectedType] = useState(null);
  const [config, setConfig] = useState({});

  const reset = () => {
    setSelectedType(null);
    setConfig({});
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const chooseType = (tt) => {
    if (!tt.availability(ctx)) {
      return;
    }

    setSelectedType(tt);
    setConfig(tt.getDefaultConfig ? tt.getDefaultConfig(ctx) : {});
  };

  const confirmAdd = () => {
    onAdd(selectedType, config);
    reset();
  };

  const tileTypes = getTileTypes(ctx);

  return (
    <Modal show={show} onHide={handleClose} data-bs-theme="dark" size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{selectedType ? `Configure: ${selectedType.label}` : 'Add a Tile'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {selectedType ? (
          <>
            <TileTitleField config={config} defaultLabel={selectedType.label} onChange={(patch) => setConfig(c => ({ ...c, ...patch }))} />
            {selectedType.ConfigForm && (
              <selectedType.ConfigForm ctx={ctx} config={config} onChange={(patch) => setConfig(c => ({ ...c, ...patch }))} />
            )}
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
            {tileTypes.map(tt => {
              const available = tt.availability(ctx);
              return (
                <div
                  key={tt.type}
                  className={`view-type-card${available ? '' : ' disabled'}`}
                  onClick={() => chooseType(tt)}
                  title={available ? `Add ${tt.label}` : 'Set up the matching Planning view first'}
                >
                  <div className="view-type-thumbnail">
                    <tt.Thumbnail />
                  </div>
                  <div style={{ fontWeight: 'bold' }}>{tt.label}</div>
                  <div className="text-muted" style={{ fontSize: '0.8em', marginTop: 4 }}>{tt.description}</div>
                </div>
              );
            })}
          </div>
        )}
      </Modal.Body>
      {selectedType && (
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setSelectedType(null)}>Back</Button>
          <Button variant="primary" onClick={confirmAdd}>Add</Button>
        </Modal.Footer>
      )}
    </Modal>
  );
}

export default AddTileModal;
