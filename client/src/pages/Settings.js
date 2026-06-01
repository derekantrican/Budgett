import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Badge, Form, Row, Col } from 'react-bootstrap';
import { NavLink } from 'react-router-dom';
import { usePlaidLink } from 'react-plaid-link';
import { getLinkToken, exchangeToken, getItems, getSettings, updateSettings } from '../services/api';

function Settings() {
  const [items, setItems] = useState([]);
  const [linkToken, setLinkToken] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [plaidEnv, setPlaidEnv] = useState('sandbox');
  const [dateFormat, setDateFormat] = useState('MMM D, YYYY');

  useEffect(() => {
    loadItems();
    getSettings().then(s => {
      if (s.date_format) setDateFormat(s.date_format);
      if (s.webhook_url) setWebhookUrl(s.webhook_url);
      if (s.base_url) setBaseUrl(s.base_url);
      if (s.plaid_env) setPlaidEnv(s.plaid_env);
    });
  }, []);

  const loadItems = async () => {
    const data = await getItems();
    setItems(data);
  };

  const handleGetLinkToken = async () => {
    const { link_token } = await getLinkToken();
    setLinkToken(link_token);
  };

  const onSuccess = useCallback(async (publicToken, metadata) => {
    await exchangeToken(publicToken, metadata.institution);
    setLinkToken(null);
    loadItems();
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => setLinkToken(null),
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  const formatBalance = (val) => {
    if (val == null) return '—';
    return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div>
      <h4 className="mb-4">Accounts</h4>

      {/* Linked Accounts */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 30 }}>
        {items.map((item) => (
          <Card key={item.id} style={{ width: 320, background: '#212529', border: 'none', borderRadius: 10 }}>
            <Card.Header
              style={{
                background: item.institution_color || '#1a73e8',
                borderRadius: '10px 10px 0 0',
                display: 'flex',
                alignItems: 'center',
                cursor: item.online_banking_url ? 'pointer' : 'default',
                minHeight: 60,
                padding: '8px 12px',
              }}
              onClick={() => item.online_banking_url && window.open(item.online_banking_url)}
            >
              {item.institution_logo && (
                <img
                  src={`data:image/png;base64,${item.institution_logo}`}
                  alt=""
                  style={{ width: 40, height: 40, marginRight: 10, borderRadius: 4 }}
                />
              )}
              <h6 style={{ margin: 0, color: '#fff', fontWeight: 'bold' }}>{item.institution_name || 'Institution'}</h6>
            </Card.Header>
            <Card.Body style={{ padding: 0 }}>
              {item.status !== 'ok' ? (
                <div style={{ padding: 16, textAlign: 'center' }}>
                  <div style={{ color: '#dc3545', marginBottom: 8 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
                    </svg>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9em' }}>You need to login again</p>
                  <Button size="sm" variant="warning" className="mt-2" onClick={handleGetLinkToken}>Re-authenticate</Button>
                </div>
              ) : (
                <table style={{ width: '100%', fontSize: '0.9em' }}>
                  <tbody>
                    {(item.accounts || []).map((acct, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #3a3a4f' }}>
                        <td style={{ padding: '10px 12px' }}>{acct.name}{acct.mask ? ` (*${acct.mask})` : ''}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {formatBalance(acct.current_balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card.Body>
          </Card>
        ))}

        {/* Add account card */}
        <Card
          style={{ width: 320, border: '2px dashed #3a3a4f', background: 'transparent', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 150, borderRadius: 10 }}
          onClick={handleGetLinkToken}
        >
          <Card.Body className="text-center" style={{ color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>+</div>
            <div>Link New Account</div>
          </Card.Body>
        </Card>
      </div>

      {/* App Settings */}
      <h4 className="mb-3">Settings</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'max-content auto', alignItems: 'center', gap: 10 }}>
          <div className="settings-label">Date Format:</div>
          <Form.Select
            value={dateFormat}
            onChange={(e) => setDateFormat(e.target.value)}
            style={{ maxWidth: 250, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
          >
            <option value="MMM D, YYYY">Jan 5, 2025</option>
            <option value="MMMM D, YYYY">January 5, 2025</option>
            <option value="MM/DD/YYYY">01/05/2025</option>
            <option value="DD/MM/YYYY">05/01/2025</option>
            <option value="YYYY-MM-DD">2025-01-05</option>
          </Form.Select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'max-content auto', alignItems: 'center', gap: 10 }}>
          <div className="settings-label">Base URL:</div>
          <input
            className="settings-input"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://your-domain.com"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'max-content auto', alignItems: 'center', gap: 10 }}>
          <div className="settings-label">Notification Webhook URL:</div>
          <input
            className="settings-input"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://your-domain.com/api/webhook"
          />
        </div>

        <div>
          <h5 style={{ color: 'var(--text-secondary)' }}>Plaid Settings</h5>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <span className="settings-label">Sandbox</span>
            <Form.Check
              type="switch"
              id="plaid-env-switch"
              checked={plaidEnv === 'production'}
              onChange={(e) => setPlaidEnv(e.target.checked ? 'production' : 'sandbox')}
              style={{ margin: 0 }}
            />
            <span className="settings-label">Production</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="settings-button" onClick={() => updateSettings({ date_format: dateFormat, webhook_url: webhookUrl, base_url: baseUrl, plaid_env: plaidEnv })}>Save</button>
          <button className="settings-button" style={{ background: 'var(--bg-tertiary)' }}>Revert</button>
        </div>
      </div>

      {/* Admin Tools */}
      <h5 className="mt-4 mb-3" style={{ color: 'var(--text-secondary)' }}>Admin Tools</h5>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <NavLink to="/settings/logs" style={{ textDecoration: 'none' }}>
          <Button variant="outline-light">Activity Log</Button>
        </NavLink>
        <NavLink to="/settings/webhooks" style={{ textDecoration: 'none' }}>
          <Button variant="outline-light">Webhook Inspector</Button>
        </NavLink>
        <NavLink to="/settings/incomplete" style={{ textDecoration: 'none' }}>
          <Button variant="outline-light">Incomplete Transactions</Button>
        </NavLink>
      </div>
    </div>
  );
}

export default Settings;
