import React, { useState, useEffect } from 'react';
import { Accordion, Badge, Tabs, Tab } from 'react-bootstrap';
import { getWebhooks } from '../../services/api';

function Webhooks() {
  const [payloads, setPayloads] = useState([]);

  useEffect(() => {
    getWebhooks(200).then(setPayloads);
  }, []);

  const incoming = payloads.filter(p => !p.direction || p.direction === 'incoming');
  const outgoing = payloads.filter(p => p.direction === 'outgoing');

  const renderList = (items) => (
    <Accordion>
      {items.map((payload) => (
        <Accordion.Item key={payload.id} eventKey={String(payload.id)}>
          <Accordion.Header>
            <Badge bg={payload.type?.includes('FAILED') ? 'danger' : 'secondary'} className="me-2">{payload.type}</Badge>
            {payload.destination && <span style={{ color: 'var(--text-secondary)', fontSize: '0.8em', marginRight: 8 }}>{payload.destination}</span>}
            <span style={{ fontSize: '0.85em' }}>{payload.timestamp}</span>
          </Accordion.Header>
          <Accordion.Body>
            <pre style={{ fontSize: '0.8rem', maxHeight: '400px', overflow: 'auto' }}>
              {(() => { try { return JSON.stringify(JSON.parse(payload.raw_json), null, 2); } catch { return payload.raw_json; } })()}
            </pre>
          </Accordion.Body>
        </Accordion.Item>
      ))}
      {items.length === 0 && <p style={{ color: 'var(--text-secondary)', padding: 16 }}>No webhooks recorded yet.</p>}
    </Accordion>
  );

  return (
    <div>
      <h4>Webhook Inspector</h4>
      <Tabs defaultActiveKey="all" className="mb-3">
        <Tab eventKey="all" title={`All (${payloads.length})`}>
          {renderList(payloads)}
        </Tab>
        <Tab eventKey="incoming" title={`Received (${incoming.length})`}>
          {renderList(incoming)}
        </Tab>
        <Tab eventKey="outgoing" title={`Sent (${outgoing.length})`}>
          {renderList(outgoing)}
        </Tab>
      </Tabs>
    </div>
  );
}

export default Webhooks;
