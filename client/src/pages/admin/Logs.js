import React, { useState, useEffect } from 'react';
import { getLogs } from '../../services/api';

const levelColor = { error: '#ff6b6b', warn: '#ffd43b', info: '#868e96' };

function Logs() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    getLogs(200).then(setLogs);
  }, []);

  return (
    <div>
      <h2>Logs</h2>
      <div style={{
        fontFamily: 'monospace',
        fontSize: '0.8rem',
        background: '#0d1117',
        border: '1px solid #30363d',
        borderRadius: 6,
        padding: '12px 16px',
        maxHeight: 'calc(100vh - 140px)',
        overflowY: 'auto',
        lineHeight: 1.7,
      }}>
        {logs.map((log) => (
          <div key={log.id}>
            <span style={{ color: '#6e7681' }}>
              {new Date(log.timestamp + 'Z').toLocaleString([], { hour12: false })}
            </span>
            {' '}
            <span style={{ color: levelColor[log.level] || '#c9d1d9' }}>
              {log.level.toUpperCase().padEnd(5)}
            </span>
            {' '}
            <span style={{ color: '#58a6ff' }}>{log.action}</span>
            {log.detail ? <span style={{ color: '#c9d1d9' }}> {log.detail}</span> : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Logs;
