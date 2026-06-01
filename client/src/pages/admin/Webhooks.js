import React, { useState, useEffect } from 'react';
import { Accordion, Badge } from 'react-bootstrap';
import { getWebhooks } from '../../services/api';

function Webhooks() {
  const [payloads, setPayloads] = useState([]);

  useEffect(() => {
    getWebhooks(100).then(setPayloads);
  }, []);

  return (
    <div>
      <h2>Webhook Inspector</h2>
      <Accordion>
        {payloads.map((payload) => (
          <Accordion.Item key={payload.id} eventKey={String(payload.id)}>
            <Accordion.Header>
              <Badge bg="secondary" className="me-2">{payload.type}</Badge>
              {payload.timestamp}
            </Accordion.Header>
            <Accordion.Body>
              <pre style={{ fontSize: '0.8rem', maxHeight: '400px', overflow: 'auto' }}>
                {JSON.stringify(JSON.parse(payload.raw_json), null, 2)}
              </pre>
            </Accordion.Body>
          </Accordion.Item>
        ))}
      </Accordion>
    </div>
  );
}

export default Webhooks;
