import React from 'react';
import { Modal } from 'react-bootstrap';
import VIEW_TYPES from './viewTypes';

function AddViewModal({ show, onClose, onChoose }) {
  return (
    <Modal show={show} onHide={onClose} data-bs-theme="dark" size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Add a View</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
          {VIEW_TYPES.map(vt => (
            <div
              key={vt.type}
              className={`view-type-card${vt.comingSoon ? ' disabled' : ''}`}
              onClick={() => !vt.comingSoon && onChoose(vt)}
              title={vt.comingSoon ? 'Coming soon' : `Add ${vt.label}`}
            >
              <div className="view-type-thumbnail">
                <vt.Thumbnail />
              </div>
              <div style={{ fontWeight: 'bold' }}>
                {vt.label}
                {vt.comingSoon && <span className="text-muted" style={{ fontWeight: 'normal' }}> (coming soon)</span>}
              </div>
              <div className="text-muted" style={{ fontSize: '0.8em', marginTop: 4 }}>{vt.description}</div>
            </div>
          ))}
        </div>
      </Modal.Body>
    </Modal>
  );
}

export default AddViewModal;
