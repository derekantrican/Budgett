import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Form, Modal } from 'react-bootstrap';
import { NavLink } from 'react-router-dom';
import { usePlaidLink } from 'react-plaid-link';
import { getLinkToken, exchangeToken, getItems, getSettings, updateSettings, updateItem, updateAccount, deleteItem } from '../services/api';

function Settings() {
  const [items, setItems] = useState([]);
  const [linkToken, setLinkToken] = useState(null);
  const [reauthItemId, setReauthItemId] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [plaidEnv, setPlaidEnv] = useState('sandbox');
  const [dateFormat, setDateFormat] = useState('MMM D, YYYY');
  const [numberFormat, setNumberFormat] = useState('1,000.00');

  // Edit institution modal
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({});

  // Delete institution flow
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteOptions, setDeleteOptions] = useState(false);
  const [deleteTxnAction, setDeleteTxnAction] = useState('keep');

  useEffect(() => {
    loadItems();
    getSettings().then(s => {
      if (s.date_format) 
        setDateFormat(s.date_format);
      if (s.webhook_url) 
        setWebhookUrl(s.webhook_url);
      if (s.base_url) 
        setBaseUrl(s.base_url);
      if (s.plaid_env) 
        setPlaidEnv(s.plaid_env);
      if (s.number_format) 
        setNumberFormat(s.number_format);
    });
  }, []);

  const loadItems = async () => {
    const data = await getItems();
    setItems(data);
  };

  const handleGetLinkToken = async (itemId) => {
    try {
      setReauthItemId(itemId || null);
      const { link_token } = await getLinkToken(itemId);
      setLinkToken(link_token);
    }
    catch (err) {
      alert('Failed to create link token. Make sure PLAID credentials and WEBHOOK_URL are configured in .env.');
    }
  };

  const onSuccess = useCallback(async (publicToken, metadata) => {
    if (reauthItemId) {
      await updateItem(reauthItemId, { status: 'ok' });
    }
    else {
      await exchangeToken(publicToken, metadata.institution);
    }

    setLinkToken(null);
    setReauthItemId(null);
    loadItems();
  }, [reauthItemId]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => setLinkToken(null),
  });

  useEffect(() => {
    if (linkToken && ready) 
      open();
  }, [linkToken, ready, open]);

  const formatBalance = (val) => {
    if (val == null) 
      return '—';
    return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const openEditItem = (item) => {
    setEditItem(item);
    setEditForm({
      display_name: item.display_name || '',
      display_icon_url: item.display_icon_url || '',
      accounts: (item.accounts || []).map(a => ({
        id: a.id,
        name: a.name,
        mask: a.mask,
        display_name: a.display_name || '',
        hide_from_transactions: !!a.hide_from_transactions,
      })),
    });
  };

  const handleEditSave = async () => {
    await updateItem(editItem.id, {
      display_name: editForm.display_name,
      display_icon_url: editForm.display_icon_url,
    });
    for (const acct of editForm.accounts) {
      await updateAccount(acct.id, {
        display_name: acct.display_name,
        hide_from_transactions: acct.hide_from_transactions,
      });
    }

    setEditItem(null);
    loadItems();
  };

  const getItemDisplayName = (item) => item.display_name || item.institution_name || 'Institution';

  const getAccountDisplayName = (acct) => acct.display_name || acct.name;

  return (
    <div>
      <h4 className="mb-4">Accounts</h4>

      {/* Linked Accounts */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 30 }}>
        {items.map((item) => (
          <Card key={item.id} className="institution-card" style={{ width: 320, maxWidth: '100%', background: '#212529', border: 'none', borderRadius: 10 }}>
            <Card.Header
              style={{
                background: item.institution_color || '#1a73e8',
                borderRadius: '10px 10px 0 0',
                display: 'flex',
                alignItems: 'center',
                minHeight: 60,
                padding: '8px 12px',
                position: 'relative',
              }}
            >
              {item.display_icon_url ? (
                <img
                  src={item.display_icon_url}
                  alt=""
                  style={{ width: 40, height: 40, marginRight: 10, borderRadius: 4, objectFit: 'contain' }}
                />
              ) : item.institution_logo ? (
                <img
                  src={`data:image/png;base64,${item.institution_logo}`}
                  alt=""
                  style={{ width: 40, height: 40, marginRight: 10, borderRadius: 4 }}
                />
              ) : null}
              <h6 style={{ margin: 0, color: '#fff', fontWeight: 'bold', flex: 1 }}>{getItemDisplayName(item)}</h6>
              <button
                className="institution-edit-btn"
                onClick={() => openEditItem(item)}
                title="Edit institution"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/>
                </svg>
              </button>
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
                  <Button size="sm" variant="warning" className="mt-2" onClick={() => handleGetLinkToken(item.id)}>Re-authenticate</Button>
                </div>
              ) : (
                <table style={{ width: '100%', fontSize: '0.9em' }}>
                  <tbody>
                    {(item.accounts || []).map((acct, i, arr) => (
                      <tr key={i} style={{ borderBottom: i < arr.length - 1 ? '1px solid #3a3a4f' : 'none', opacity: acct.hide_from_transactions ? 0.5 : 1 }}>
                        <td style={{ padding: '10px 12px' }}>
                          {getAccountDisplayName(acct)}
                          {acct.mask ? <span style={{ color: 'var(--text-secondary)' }}> (*{acct.mask})</span> : ''}
                        </td>
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
          style={{ width: 320, maxWidth: '100%', border: '2px dashed #3a3a4f', background: 'transparent', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 150, borderRadius: 10 }}
          onClick={() => handleGetLinkToken()}
        >
          <Card.Body className="text-center" style={{ color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>+</div>
            <div>Link New Account</div>
          </Card.Body>
        </Card>
      </div>

      {/* Edit Institution Modal */}
      <Modal show={!!editItem} onHide={() => { setEditItem(null); setConfirmDelete(false); setDeleteOptions(false); setDeleteTxnAction('keep'); }} data-bs-theme="dark">
        <Modal.Header closeButton>
          <Modal.Title>Edit Institution</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {editItem && (
            <>
              <Form.Group className="mb-3">
                <Form.Label>Display Name</Form.Label>
                <Form.Control
                  value={editForm.display_name}
                  onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                  placeholder={editItem.institution_name || 'Institution name'}
                />
                <Form.Text style={{ color: 'var(--text-secondary)' }}>
                  Leave blank to use "{editItem.institution_name}"
                </Form.Text>
              </Form.Group>
              <Form.Group className="mb-4">
                <Form.Label>Icon URL</Form.Label>
                <Form.Control
                  value={editForm.display_icon_url}
                  onChange={(e) => setEditForm({ ...editForm, display_icon_url: e.target.value })}
                  placeholder="https://example.com/icon.png"
                />
                <Form.Text style={{ color: 'var(--text-secondary)' }}>
                  Leave blank to use Plaid's logo
                </Form.Text>
              </Form.Group>
              <hr style={{ borderColor: '#3a3a4f' }} />
              <h6 className="mb-3">Accounts</h6>
              {editForm.accounts.map((acct, idx) => (
                <div key={acct.id} style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: '0.8em', color: 'var(--text-secondary)', marginBottom: 6 }}>
                    {acct.name}{acct.mask ? ` (*${acct.mask})` : ''}
                  </div>
                  <Form.Group className="mb-2">
                    <Form.Control
                      size="sm"
                      value={acct.display_name}
                      onChange={(e) => {
                        const accts = [...editForm.accounts];
                        accts[idx] = { ...accts[idx], display_name: e.target.value };
                        setEditForm({ ...editForm, accounts: accts });
                      }}
                      placeholder="Override display name"
                    />
                  </Form.Group>
                  <Form.Check
                    type="switch"
                    id={`hide-${acct.id}`}
                    label="Hide transactions"
                    checked={acct.hide_from_transactions}
                    onChange={(e) => {
                      const accts = [...editForm.accounts];
                      accts[idx] = { ...accts[idx], hide_from_transactions: e.target.checked };
                      setEditForm({ ...editForm, accounts: accts });
                    }}
                  />
                </div>
              ))}
            </>
          )}
        </Modal.Body>
        <Modal.Footer className="d-flex justify-content-between">
          <Button variant="outline-danger" onClick={() => setConfirmDelete(true)}>Delete</Button>
          <div>
            <Button variant="secondary" className="me-2" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button variant="primary" onClick={handleEditSave}>Save</Button>
          </div>
        </Modal.Footer>
      </Modal>

      {/* Confirm Delete Modal */}
      <Modal show={confirmDelete} onHide={() => setConfirmDelete(false)} data-bs-theme="dark" centered>
        <Modal.Header closeButton>
          <Modal.Title>Delete Institution</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete <strong>{editItem?.display_name || editItem?.institution_name}</strong> and all its accounts?
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => { setConfirmDelete(false); setDeleteOptions(true); }}>Yes, Delete</Button>
        </Modal.Footer>
      </Modal>

      {/* Delete Options Modal */}
      <Modal show={deleteOptions} onHide={() => setDeleteOptions(false)} data-bs-theme="dark" centered>
        <Modal.Header closeButton>
          <Modal.Title>Delete Options</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Transactions for this institution in the database should be</Form.Label>
            <Form.Select
              value={deleteTxnAction}
              onChange={(e) => setDeleteTxnAction(e.target.value)}
            >
              <option value="keep">Kept</option>
              <option value="delete">Deleted</option>
            </Form.Select>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setDeleteOptions(false)}>Cancel</Button>
          <Button variant="danger" onClick={async () => {
            await deleteItem(editItem.id, deleteTxnAction === 'delete');
            setDeleteOptions(false);
            setEditItem(null);
            loadItems();
          }}>Continue</Button>
        </Modal.Footer>
      </Modal>

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

        <div style={{ display: 'grid', gridTemplateColumns: 'max-content auto', alignItems: 'center', gap: 10 }}>
          <div className="settings-label">Number Format:</div>
          <Form.Select
            value={numberFormat}
            onChange={(e) => setNumberFormat(e.target.value)}
            style={{ maxWidth: 250, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
          >
            <option value="1,000.00">1,000.00</option>
            <option value="1000.00">1000.00</option>
            <option value="1.000,00">1.000,00</option>
            <option value="1000,00">1000,00</option>
          </Form.Select>
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
          <button className="settings-button" onClick={() => updateSettings({ date_format: dateFormat, webhook_url: webhookUrl, base_url: baseUrl, plaid_env: plaidEnv, number_format: numberFormat })}>Save</button>
          <button className="settings-button" style={{ background: 'var(--bg-tertiary)' }}>Revert</button>
        </div>
      </div>

      {/* Data Management */}
      <h5 className="mt-4 mb-3" style={{ color: 'var(--text-secondary)' }}>Data Management</h5>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <NavLink to="/settings/rules" style={{ textDecoration: 'none' }}>
          <Button variant="outline-light">Rules</Button>
        </NavLink>
        <NavLink to="/settings/templates" style={{ textDecoration: 'none' }}>
          <Button variant="outline-light">Templates</Button>
        </NavLink>
      </div>

      {/* Admin Tools */}
      <h5 className="mt-4 mb-3" style={{ color: 'var(--text-secondary)' }}>Admin Tools</h5>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <NavLink to="/settings/logs" style={{ textDecoration: 'none' }}>
          <Button variant="outline-light">Logs</Button>
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
