import React, { useState, useEffect } from 'react';
import { Table } from 'react-bootstrap';
import { getLogs } from '../../services/api';

function Logs() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    getLogs(200).then(setLogs);
  }, []);

  return (
    <div>
      <h2>Activity Log</h2>
      <div style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
        <Table size="sm" striped>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Level</th>
              <th>Action</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.timestamp + 'Z').toLocaleString()}</td>
                <td className={log.level === 'error' ? 'text-danger' : log.level === 'warn' ? 'text-warning' : ''}>{log.level}</td>
                <td>{log.action}</td>
                <td>{log.detail}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}

export default Logs;
