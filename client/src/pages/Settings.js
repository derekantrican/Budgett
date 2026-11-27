import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Form, Modal } from 'react-bootstrap';
import { NavLink } from 'react-router-dom';
import { usePlaidLink } from 'react-plaid-link';
import { getPlaidLinkToken, exchangePlaidToken, connectSimplefin, syncSimplefin, getSimplefinPending, reviewSimplefinPending,
  checkPossibleDuplicates, getInstitutions, getSettings, updateSettings, updateInstitution, updateAccount, deleteInstitution, getAccountDiff, removeAccountsApi, rescanExtensions } from '../services/api';
import { useLiveUpdates } from '../services/liveUpdates';
import { IS_DEMO } from '../demo/isDemo';

// Provider logos (client/public/connectors/*): the provider's icon plus its name. Plaid's ink is
// navy, which disappears on the dark theme, so it's drawn white (as Plaid's own dark-background
// logo is). Falls back to the provider's name if the image is missing.
const PROVIDER_LOGOS = {
  plaid: { label: 'Plaid', file: 'plaid.png', style: { filter: 'brightness(0) invert(1)' } },
  simplefin: { label: 'SimpleFIN', file: 'simplefin.png' },
};

function ProviderLogo({ provider, height }) {
  const [failed, setFailed] = useState(false);
  const logo = PROVIDER_LOGOS[provider] || { label: provider };
  if (failed || !logo.file) {
    return <span style={{ fontWeight: 'bold', color: 'var(--text-secondary)' }}>{logo.label}</span>;
  }

  return (
    <img src={`${process.env.PUBLIC_URL}/connectors/${logo.file}`} alt={logo.label} onError={() => setFailed(true)}
      style={{ height, maxWidth: '100%', objectFit: 'contain', ...logo.style }} />
  );
}

function Settings() {
  const [institutions, setInstitutions] = useState([]);
  const [linkToken, setLinkToken] = useState(null);
  const [reauthInstitutionId, setReauthInstitutionId] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [plaidEnv, setPlaidEnv] = useState('sandbox');
  const [dateFormat, setDateFormat] = useState('MMM D, YYYY');
  const [numberFormat, setNumberFormat] = useState('1,000.00');
  const [extensionsFolderPath, setExtensionsFolderPath] = useState('');
  const [rescanning, setRescanning] = useState(false);

  // Edit institution modal
  const [editInstitution, setEditInstitution] = useState(null);
  const [editForm, setEditForm] = useState({});

  // Delete institution flow
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteOptions, setDeleteOptions] = useState(false);
  const [deleteTxnAction, setDeleteTxnAction] = useState('keep');

  // Accounts deselected during a reconnect (Link update mode)
  const [removedAccounts, setRemovedAccounts] = useState([]);
  const [removeAccountsInstitutionId, setRemoveAccountsInstitutionId] = useState(null);
  const [removeAccountsTxnAction, setRemoveAccountsTxnAction] = useState('keep');

  // Add Institution dialog: null (closed) | 'choose' (pick a provider) | 'simplefin' (setup token)
  // | 'simplefin-review' (pick which SimpleFIN banks to import)
  const [addStep, setAddStep] = useState(null);
  // SimpleFIN banks held for review (all of them right after connecting; later, new ones that look
  // already linked), and which of them are ticked for import, keyed `${credential_id}:${conn_id}`
  const [simplefinPending, setSimplefinPending] = useState([]);
  const [reviewChoices, setReviewChoices] = useState({});
  // Plaid Link finished for accounts that look already linked: { publicToken, metadata, duplicates }
  const [plaidDuplicates, setPlaidDuplicates] = useState(null);
  const [simplefinToken, setSimplefinToken] = useState('');
  const [simplefinBusy, setSimplefinBusy] = useState(false);
  const [simplefinMessage, setSimplefinMessage] = useState(null); // { variant, text }

  useEffect(() => {
    loadInstitutions();
    getSettings().then(s => {
      if (s.date_format) {
        setDateFormat(s.date_format);
      }

      if (s.webhook_url) {
        setWebhookUrl(s.webhook_url);
      }

      if (s.base_url) {
        setBaseUrl(s.base_url);
      }

      if (s.plaid_env) {
        setPlaidEnv(s.plaid_env);
      }

      if (s.number_format) {
        setNumberFormat(s.number_format);
      }

      if (s.extensions_folder_path) {
        setExtensionsFolderPath(s.extensions_folder_path);
      }
    });
  }, []);

  const loadInstitutions = async () => {
    const data = await getInstitutions();
    setInstitutions(data);
    getSimplefinPending().then(setSimplefinPending).catch(() => setSimplefinPending([]));
  };

  // Pick up sync status / balances / account changes from syncs and other browsers
  useLiveUpdates(['institutions', 'accounts'], loadInstitutions);

  const handleGetLinkToken = async (institutionId) => {
    if (IS_DEMO) {
      alert('Linking bank accounts through Plaid is not available in the demo.');
      return;
    }

    try {
      setReauthInstitutionId(institutionId || null);
      const { link_token } = await getPlaidLinkToken(institutionId);
      setLinkToken(link_token);
    }
    catch (err) {
      alert('Failed to create link token. Make sure PLAID credentials and WEBHOOK_URL are configured in .env.');
    }
  };

  const onSuccess = useCallback(async (publicToken, metadata) => {
    if (reauthInstitutionId) {
      await updateInstitution(reauthInstitutionId, { status: 'ok' });

      // Account selection may have changed during update mode — check whether any
      // previously-linked accounts were deselected so we can ask what to do with them.
      try {
        const diff = await getAccountDiff(reauthInstitutionId);
        if (diff.removed && diff.removed.length > 0) {
          setRemovedAccounts(diff.removed);
          setRemoveAccountsInstitutionId(reauthInstitutionId);
        }
      }
      catch (err) {
        // Non-fatal — the reconnect itself already succeeded
      }
    }
    else {
      // Warn before linking accounts that are already linked (e.g. through SimpleFIN): each
      // connector has its own ids, so every transaction would be imported twice
      let duplicates = [];
      try {
        ({ duplicates } = await checkPossibleDuplicates(metadata.institution?.name,
          (metadata.accounts || []).map(a => ({ name: a.name, mask: a.mask }))));
      }
      catch (err) {
        // The check is advisory; link as normal if it fails
      }

      if (duplicates.length > 0) {
        setPlaidDuplicates({ publicToken, metadata, duplicates });
        setLinkToken(null);
        return;
      }

      await exchangePlaidToken(publicToken, metadata.institution);
    }

    setLinkToken(null);
    setReauthInstitutionId(null);
    loadInstitutions();
  }, [reauthInstitutionId]);

  const handleResolveRemovedAccounts = async () => {
    await removeAccountsApi(
      removeAccountsInstitutionId,
      removedAccounts.map(a => a.id),
      removeAccountsTxnAction === 'delete'
    );
    setRemovedAccounts([]);
    setRemoveAccountsInstitutionId(null);
    setRemoveAccountsTxnAction('keep');
    loadInstitutions();
  };

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => setLinkToken(null),
  });

  useEffect(() => {
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);

  const formatBalance = (val) => {
    if (val == null) {
      return '—';
    }

    return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const openEditInstitution = (institution) => {
    setEditInstitution(institution);
    setEditForm({
      display_name: institution.display_name || '',
      display_icon_url: institution.display_icon_url || '',
      display_color: institution.display_color || '',
      accounts: (institution.accounts || []).map(a => ({
        id: a.id,
        name: a.name,
        mask: a.mask,
        display_name: a.display_name || '',
        hide_from_transactions: !!a.hide_from_transactions,
      })),
    });
  };

  const handleEditSave = async () => {
    await updateInstitution(editInstitution.id, {
      display_name: editForm.display_name,
      display_icon_url: editForm.display_icon_url,
      display_color: editForm.display_color,
    });
    for (const acct of editForm.accounts) {
      await updateAccount(acct.id, {
        display_name: acct.display_name,
        hide_from_transactions: acct.hide_from_transactions,
      });
    }

    setEditInstitution(null);
    loadInstitutions();
  };

  const handleRescanExtensions = async () => {
    setRescanning(true);
    try {
      await updateSettings({ extensions_folder_path: extensionsFolderPath });
      await rescanExtensions();
      window.location.reload();
    }
    catch (err) {
      setRescanning(false);
      alert('Failed to rescan extensions: ' + err.message);
    }
  };

  const handleLinkPlaidAnyway = async () => {
    const { publicToken, metadata } = plaidDuplicates;
    setPlaidDuplicates(null);
    await exchangePlaidToken(publicToken, metadata.institution);
    loadInstitutions();
  };

  const openSimplefinReview = (pending) => {
    setSimplefinPending(pending);
    // Tick everything except banks that look already linked
    setReviewChoices(Object.fromEntries(pending.map(p => [`${p.credential_id}:${p.conn_id}`, p.duplicates.length === 0])));
    setSimplefinMessage(null);
    setAddStep('simplefin-review');
  };

  const handleReviewSimplefin = async () => {
    setSimplefinBusy(true);
    setSimplefinMessage(null);
    try {
      const byCredential = new Map();
      for (const p of simplefinPending) {
        const choice = byCredential.get(p.credential_id) || { import: [], ignore: [] };
        (reviewChoices[`${p.credential_id}:${p.conn_id}`] ? choice.import : choice.ignore).push(p.conn_id);
        byCredential.set(p.credential_id, choice);
      }

      for (const [credentialId, choice] of byCredential) {
        await reviewSimplefinPending(credentialId, choice.import, choice.ignore);
      }

      setAddStep(null);
    }
    catch (err) {
      setSimplefinMessage({ variant: 'danger', text: err.message });
    }
    finally {
      setSimplefinBusy(false);
      loadInstitutions();
    }
  };

  const handleConnectSimplefin = async () => {
    setSimplefinBusy(true);
    setSimplefinMessage(null);
    try {
      const result = await connectSimplefin(simplefinToken.trim());
      setSimplefinToken('');
      loadInstitutions();
      if (result.warning) {
        setSimplefinMessage({ variant: 'warning', text: result.warning });
      }
      else if (result.pending.length > 0) {
        openSimplefinReview(result.pending);
      }
      else {
        setSimplefinMessage({ variant: 'warning', text: 'Connected, but SimpleFIN Bridge has no banks linked yet. Link some in Bridge; they\'ll be imported on the next sync.' });
      }
    }
    catch (err) {
      setSimplefinMessage({ variant: 'danger', text: err.message });
    }
    finally {
      setSimplefinBusy(false);
    }
  };

  const handleSyncSimplefin = async () => {
    if (IS_DEMO) {
      alert('SimpleFIN is not available in the demo.');
      return;
    }

    setSimplefinBusy(true);
    try {
      await syncSimplefin();
      loadInstitutions();
    }
    catch (err) {
      alert(err.message);
    }
    finally {
      setSimplefinBusy(false);
    }
  };

  const hasSimplefin = institutions.some(i => i.provider === 'simplefin');

  const getInstitutionDisplayName = (institution) => institution.display_name || institution.name || 'Institution';

  const getAccountDisplayName = (acct) => acct.display_name || acct.name;

  return (
    <div>
      <h4 className="mb-4">Accounts</h4>

      {/* Linked Accounts */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 30 }}>
        {institutions.map((institution) => (
          <Card key={institution.id} className="institution-card" style={{ width: 320, maxWidth: '100%', background: '#212529', border: 'none', borderRadius: 10 }}>
            <Card.Header
              style={{
                background: institution.display_color || institution.color || '#1a73e8',
                borderRadius: '10px 10px 0 0',
                display: 'flex',
                alignItems: 'center',
                minHeight: 60,
                padding: '8px 12px',
                position: 'relative',
              }}
            >
              {institution.display_icon_url ? (
                <img
                  src={institution.display_icon_url}
                  alt=""
                  style={{ width: 40, height: 40, marginRight: 10, borderRadius: 4, objectFit: 'contain' }}
                />
              ) : institution.logo ? (
                <img
                  src={`data:image/png;base64,${institution.logo}`}
                  alt=""
                  style={{ width: 40, height: 40, marginRight: 10, borderRadius: 4 }}
                />
              ) : null}
              <h6 style={{ margin: 0, color: '#fff', fontWeight: 'bold', flex: 1 }}>{getInstitutionDisplayName(institution)}</h6>
              <button
                className="institution-edit-btn"
                onClick={() => openEditInstitution(institution)}
                title="Edit institution"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/>
                </svg>
              </button>
            </Card.Header>
            <Card.Body style={{ padding: 0 }}>
              {institution.status !== 'ok' ? (
                <div style={{ padding: 16, textAlign: 'center' }}>
                  <div style={{ color: '#dc3545', marginBottom: 8 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
                    </svg>
                  </div>
                  {institution.provider === 'simplefin' ? (
                    <>
                      <p style={{ margin: 0, fontSize: '0.9em' }}>SimpleFIN can't reach this bank. Fix the connection in SimpleFIN Bridge.</p>
                      <Button size="sm" variant="warning" className="mt-2" href="https://bridge.simplefin.org" target="_blank" rel="noopener noreferrer">Open SimpleFIN Bridge</Button>
                    </>
                  ) : (
                    <>
                      <p style={{ margin: 0, fontSize: '0.9em' }}>You need to login again</p>
                      <Button size="sm" variant="warning" className="mt-2" onClick={() => handleGetLinkToken(institution.id)}>Re-authenticate</Button>
                    </>
                  )}
                </div>
              ) : (
                <table style={{ width: '100%', fontSize: '0.9em' }}>
                  <tbody>
                    {(institution.accounts || []).map((acct, i, arr) => (
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

        {/* Add institution card */}
        <Card
          style={{ width: 320, maxWidth: '100%', border: '2px dashed #3a3a4f', background: 'transparent', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 150, borderRadius: 10 }}
          onClick={() => {
            if (IS_DEMO) {
              alert('Linking bank accounts is not available in the demo.');
              return;
            }

            setSimplefinMessage(null);
            setAddStep('choose');
          }}
        >
          <Card.Body className="text-center d-flex flex-column justify-content-center" style={{ color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>+</div>
            <div>Add Institution</div>
          </Card.Body>
        </Card>
      </div>

      {simplefinPending.length > 0 && addStep !== 'simplefin-review' && (
        <div className="alert alert-warning d-flex align-items-center justify-content-between" style={{ fontSize: '0.9em', gap: 12 }}>
          <span>
            SimpleFIN has {simplefinPending.length === 1 ? 'a bank' : `${simplefinPending.length} banks`} waiting for review
            ({simplefinPending.map(p => p.name || p.conn_id).join(', ')}).
            {simplefinPending.some(p => p.duplicates.length > 0) && ' Some look like accounts that are already linked.'}
          </span>
          <Button size="sm" variant="warning" onClick={() => openSimplefinReview(simplefinPending)}>Review</Button>
        </div>
      )}

      {hasSimplefin && (
        <div style={{ marginTop: -18, marginBottom: 30, fontSize: '0.9em', color: 'var(--text-secondary)' }}>
          SimpleFIN banks sync about every 12 hours.{' '}
          <Button size="sm" variant="outline-secondary" disabled={simplefinBusy} onClick={handleSyncSimplefin}>
            {simplefinBusy ? 'Syncing...' : 'Sync now'}
          </Button>
        </div>
      )}

      {/* Add Institution Modal: pick a provider, then (SimpleFIN) paste a setup token */}
      <Modal show={!!addStep} onHide={() => !simplefinBusy && setAddStep(null)} data-bs-theme="dark" centered>
        <Modal.Header closeButton>
          <Modal.Title>
            {addStep === 'simplefin' ? 'Connect SimpleFIN' : addStep === 'simplefin-review' ? 'Choose SimpleFIN Banks' : 'Add Institution'}
          </Modal.Title>
        </Modal.Header>
        {addStep === 'choose' && (
          <Modal.Body>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              {[
                {
                  id: 'plaid', label: 'Plaid',
                  description: 'Sign in to your bank through Plaid. Transactions sync automatically as they happen.',
                  onChoose: () => {
                    setAddStep(null);
                    handleGetLinkToken();
                  },
                },
                {
                  id: 'simplefin', label: 'SimpleFIN',
                  description: "Use the banks you've linked in SimpleFIN Bridge. Syncs about every 12 hours.",
                  onChoose: () => setAddStep('simplefin'),
                },
              ].map(provider => (
                <div key={provider.id} className="view-type-card" onClick={provider.onChoose} title={`Connect with ${provider.label}`}>
                  <div className="view-type-thumbnail" style={{ backgroundColor: 'transparent' }}>
                    <ProviderLogo provider={provider.id} height={40} />
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.8em', marginTop: 4 }}>{provider.description}</div>
                </div>
              ))}
            </div>
          </Modal.Body>
        )}
        {addStep === 'simplefin' && (<>
          <Modal.Body>
            <p style={{ fontSize: '0.9em' }}>
              In <a href="https://bridge.simplefin.org" target="_blank" rel="noopener noreferrer">SimpleFIN Bridge</a>, link
              your banks and create a setup token, then paste it here. You'll then choose which of the banks you've linked
              in Bridge to import; each becomes its own institution. A setup token works only once.
            </p>
            <Form.Group>
              <Form.Label>Setup token</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={simplefinToken}
                onChange={(e) => setSimplefinToken(e.target.value)}
                placeholder="aHR0cHM6Ly9icmlkZ2Uuc2ltcGxlZmluLm9yZy9zaW1wbGVmaW4vY2xhaW0v..."
                style={{ fontFamily: 'monospace', fontSize: '0.85em' }}
              />
            </Form.Group>
            {simplefinMessage && (
              <div className={`alert alert-${simplefinMessage.variant} mt-3 mb-0`} style={{ fontSize: '0.9em' }}>{simplefinMessage.text}</div>
            )}
          </Modal.Body>
          <Modal.Footer className="d-flex justify-content-between">
            <Button variant="link" className="px-0" disabled={simplefinBusy} onClick={() => setAddStep('choose')}>&larr; Back</Button>
            <div>
              <Button variant="secondary" className="me-2" disabled={simplefinBusy} onClick={() => setAddStep(null)}>Cancel</Button>
              <Button variant="primary" disabled={simplefinBusy || !simplefinToken.trim()} onClick={handleConnectSimplefin}>
                {simplefinBusy ? 'Connecting...' : 'Connect'}
              </Button>
            </div>
          </Modal.Footer>
        </>)}
        {addStep === 'simplefin-review' && (<>
          <Modal.Body>
            <p style={{ fontSize: '0.9em' }}>
              Choose which banks to import. A bank that's already linked (for example through Plaid) would have every
              transaction imported twice, so those are unticked. Unticked banks are skipped for good; to add one later,
              connect SimpleFIN again with a new setup token.
            </p>
            {simplefinPending.map(p => {
              const key = `${p.credential_id}:${p.conn_id}`;
              return (
                <div key={key} className="mb-3 p-2" style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
                  <Form.Check
                    type="checkbox"
                    id={`sf-review-${key}`}
                    checked={!!reviewChoices[key]}
                    onChange={(e) => setReviewChoices({ ...reviewChoices, [key]: e.target.checked })}
                    label={<strong>{p.name || p.conn_id}</strong>}
                  />
                  <div className="text-muted" style={{ fontSize: '0.85em', marginLeft: 24 }}>
                    {p.accounts.map(a => a.name).join(', ') || 'No accounts'}
                  </div>
                  {p.duplicates.length > 0 && (
                    <div className="alert alert-warning mt-2 mb-0 py-1 px-2" style={{ fontSize: '0.85em' }}>
                      Looks already linked:
                      <ul className="mb-0 ps-3">
                        {p.duplicates.map(d => (
                          <li key={d.account.name}>
                            {d.account.name} &rarr; {d.matches.map(m => `${m.institution_name} ${m.account_name} (${PROVIDER_LOGOS[m.provider]?.label || m.provider}; ${m.reasons.join(', ')})`).join('; ')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
            {simplefinMessage && (
              <div className={`alert alert-${simplefinMessage.variant} mt-3 mb-0`} style={{ fontSize: '0.9em' }}>{simplefinMessage.text}</div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" className="me-2" disabled={simplefinBusy} onClick={() => setAddStep(null)}>Decide later</Button>
            <Button variant="primary" disabled={simplefinBusy} onClick={handleReviewSimplefin}>
              {simplefinBusy ? 'Importing...' : `Import ${Object.values(reviewChoices).filter(Boolean).length} selected`}
            </Button>
          </Modal.Footer>
        </>)}
      </Modal>

      {/* Plaid Link finished for accounts that look already linked */}
      <Modal show={!!plaidDuplicates} onHide={() => setPlaidDuplicates(null)} data-bs-theme="dark" centered>
        <Modal.Header closeButton>
          <Modal.Title>Already Linked?</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ fontSize: '0.9em' }}>
          <p>
            These accounts from {plaidDuplicates?.metadata.institution?.name || 'this bank'} look like accounts that are
            already linked. Linking them again would import every transaction twice.
          </p>
          <ul>
            {plaidDuplicates?.duplicates.map(d => (
              <li key={`${d.account.name}-${d.account.mask}`}>
                {d.account.name}{d.account.mask ? ` (...${d.account.mask})` : ''} &rarr;{' '}
                {d.matches.map(m => `${m.institution_name} ${m.account_name} (${PROVIDER_LOGOS[m.provider]?.label || m.provider}; ${m.reasons.join(', ')})`).join('; ')}
              </li>
            ))}
          </ul>
          <p className="mb-0">Delete the existing institution first if you're moving it to Plaid.</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setPlaidDuplicates(null)}>Cancel</Button>
          <Button variant="warning" onClick={handleLinkPlaidAnyway}>Link anyway</Button>
        </Modal.Footer>
      </Modal>

      {/* Edit Institution Modal */}
      <Modal show={!!editInstitution} onHide={() => {
        setEditInstitution(null); setConfirmDelete(false); setDeleteOptions(false); setDeleteTxnAction('keep'); 
      }} data-bs-theme="dark">
        <Modal.Header closeButton>
          <Modal.Title>Edit Institution</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {editInstitution && (
            <>
              <div className="d-flex align-items-center mb-3 text-muted" style={{ gap: 8 }}>
                Synced via <ProviderLogo provider={editInstitution.provider} height={20} />
              </div>
              <Form.Group className="mb-3">
                <Form.Label>Display Name</Form.Label>
                <Form.Control
                  value={editForm.display_name}
                  onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                  placeholder={editInstitution.name || 'Institution name'}
                />
                <Form.Text style={{ color: 'var(--text-secondary)' }}>
                  Leave blank to use "{editInstitution.name}"
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
                  Leave blank to use the institution's default logo
                </Form.Text>
              </Form.Group>
              <Form.Group className="mb-4">
                <Form.Label>Color</Form.Label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Form.Control
                    type="color"
                    style={{ width: 48, padding: 2 }}
                    value={editForm.display_color || editInstitution.color || '#1a73e8'}
                    onChange={(e) => setEditForm({ ...editForm, display_color: e.target.value })}
                  />
                  {editForm.display_color && (
                    <Button size="sm" variant="outline-secondary" onClick={() => setEditForm({ ...editForm, display_color: '' })}>
                      Reset
                    </Button>
                  )}
                </div>
                <Form.Text style={{ color: 'var(--text-secondary)' }}>
                  Leave blank to use the institution's default color
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
          <div>
            <Button variant="outline-danger" className="me-2" onClick={() => setConfirmDelete(true)}>Delete</Button>
            {editInstitution?.provider === 'plaid' && (
              <Button
                variant="outline-warning"
                onClick={() => {
                  const institutionId = editInstitution.id;
                  setEditInstitution(null);
                  handleGetLinkToken(institutionId);
                }}
              >
                Reconnect
              </Button>
            )}
          </div>
          <div>
            <Button variant="secondary" className="me-2" onClick={() => setEditInstitution(null)}>Cancel</Button>
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
          Are you sure you want to delete <strong>{editInstitution?.display_name || editInstitution?.name}</strong> and all its accounts?
          {editInstitution?.provider === 'simplefin' && (
            <p className="mt-2 mb-0" style={{ fontSize: '0.9em', color: 'var(--text-secondary)' }}>
              Budgett will stop importing this bank from SimpleFIN. If it's your last SimpleFIN bank, SimpleFIN is
              disconnected and reconnecting needs a new setup token.
            </p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => {
            setConfirmDelete(false); setDeleteOptions(true); 
          }}>Yes, Delete</Button>
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
            await deleteInstitution(editInstitution.id, deleteTxnAction === 'delete');
            setDeleteOptions(false);
            setEditInstitution(null);
            loadInstitutions();
          }}>Continue</Button>
        </Modal.Footer>
      </Modal>

      {/* Removed Accounts Modal */}
      <Modal show={removedAccounts.length > 0} onHide={() => {
        setRemovedAccounts([]); setRemoveAccountsInstitutionId(null); setRemoveAccountsTxnAction('keep');
      }} data-bs-theme="dark" centered>
        <Modal.Header closeButton>
          <Modal.Title>Accounts Removed</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            The following account{removedAccounts.length > 1 ? 's are' : ' is'} no longer selected for this institution:
          </p>
          <ul>
            {removedAccounts.map((a) => (
              <li key={a.id}>
                {a.name}{a.mask ? ` (*${a.mask})` : ''} — {a.transaction_count} transaction{a.transaction_count === 1 ? '' : 's'}
              </li>
            ))}
          </ul>
          <Form.Group>
            <Form.Label>Their transactions in the database should be</Form.Label>
            <Form.Select
              value={removeAccountsTxnAction}
              onChange={(e) => setRemoveAccountsTxnAction(e.target.value)}
            >
              <option value="keep">Kept</option>
              <option value="delete">Deleted</option>
            </Form.Select>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => {
            setRemovedAccounts([]); setRemoveAccountsInstitutionId(null); setRemoveAccountsTxnAction('keep');
          }}>Decide Later</Button>
          <Button variant="danger" onClick={handleResolveRemovedAccounts}>Continue</Button>
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
            style={{ maxWidth: 250, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
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
            style={{ maxWidth: 250, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          >
            <option value="1,000.00">1,000.00</option>
            <option value="1000.00">1000.00</option>
            <option value="1.000,00">1.000,00</option>
            <option value="1000,00">1000,00</option>
          </Form.Select>
        </div>

        {/* Extensions are loaded from the server's disk, so there's nothing to configure in the demo */}
        {!IS_DEMO && <div>
          <h5 style={{ color: 'var(--text-secondary)' }}>Extensions</h5>
          <div style={{ display: 'grid', gridTemplateColumns: 'max-content auto', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div className="settings-label">Extensions Folder Path:</div>
            <input
              className="settings-input"
              value={extensionsFolderPath}
              onChange={(e) => setExtensionsFolderPath(e.target.value)}
              placeholder="/path/to/extensions"
            />
          </div>
          <button className="settings-button" onClick={handleRescanExtensions} disabled={rescanning}>
            {rescanning ? 'Rescanning...' : 'Rescan Extensions'}
          </button>
        </div>}

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
          <button className="settings-button" onClick={() => updateSettings({ date_format: dateFormat, webhook_url: webhookUrl, base_url: baseUrl, plaid_env: plaidEnv, number_format: numberFormat, extensions_folder_path: extensionsFolderPath })}>Save</button>
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
        {!IS_DEMO && (
          <>
            <NavLink to="/settings/logs" style={{ textDecoration: 'none' }}>
              <Button variant="outline-light">Logs</Button>
            </NavLink>
            <NavLink to="/settings/webhooks" style={{ textDecoration: 'none' }}>
              <Button variant="outline-light">Webhook Inspector</Button>
            </NavLink>
          </>
        )}
        <NavLink to="/settings/incomplete" style={{ textDecoration: 'none' }}>
          <Button variant="outline-light">Incomplete Transactions</Button>
        </NavLink>
        <NavLink to="/settings/money-movement" style={{ textDecoration: 'none' }}>
          <Button variant="outline-light">Money Movement</Button>
        </NavLink>
      </div>
    </div>
  );
}

export default Settings;
