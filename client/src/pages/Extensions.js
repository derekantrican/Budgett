import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Form, Spinner } from 'react-bootstrap';
import { NavLink } from 'react-router-dom';
import { getExtensions } from '../services/api';
import { loadExtensionScript, getExtensionComponent, makeExtensionApi } from '../utils/extensionHost';
import ExtensionErrorBoundary from '../components/extensions/ExtensionErrorBoundary';

function Extensions() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const [extensions, setExtensions] = useState(null);
  const [selectedSlug, setSelectedSlug] = useState(null);
  const [Component, setComponent] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    getExtensions().then(setExtensions);
  }, []);

  // Keeps the selected extension and the URL's slug in sync, same pattern as Planning.
  useEffect(() => {
    if (!extensions) {
      return;
    }

    if (!extensions.length) {
      setSelectedSlug(null);
      if (slug) {
        navigate('/extensions', { replace: true });
      }

      return;
    }

    const bySlug = slug ? extensions.find(e => e.slug === slug) : null;
    const current = extensions.find(e => e.slug === selectedSlug);
    const target = bySlug || current || extensions[0];
    setSelectedSlug(target.slug);

    if (target.slug !== slug) {
      navigate(`/extensions/${target.slug}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, extensions]);

  useEffect(() => {
    if (!selectedSlug) {
      setComponent(null);
      return;
    }

    const ext = extensions?.find(e => e.slug === selectedSlug);
    if (!ext?.has_client) {
      setComponent(null);
      return;
    }

    let cancelled = false;
    setLoadError(null);
    loadExtensionScript(selectedSlug)
      .then(() => {
        if (!cancelled) {
          setComponent(() => getExtensionComponent(selectedSlug));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err.message);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlug]);

  if (!extensions) {
    return (
      <div className="loading-container">
        <Spinner animation="border" variant="light" style={{ width: 60, height: 60 }} />
      </div>
    );
  }

  const selectedExtension = extensions.find(e => e.slug === selectedSlug) || null;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3" style={{ gap: 12, flexWrap: 'wrap' }}>
        <h4 className="mb-0">Extensions</h4>
        {extensions.length > 0 && (
          <Form.Select
            value={selectedSlug || ''}
            onChange={(e) => navigate(`/extensions/${e.target.value}`)}
            style={{ minWidth: 200 }}
          >
            {extensions.map(e => (
              <option key={e.slug} value={e.slug}>{e.name}</option>
            ))}
          </Form.Select>
        )}
      </div>

      {extensions.length === 0 ? (
        <div className="text-center" style={{ padding: '64px 16px' }}>
          <p className="text-muted">
            No extensions found. Configure an extensions folder in <NavLink to="/settings">Settings</NavLink> and click Rescan.
          </p>
        </div>
      ) : selectedExtension?.status === 'error' ? (
        <p className="text-muted">This extension's server hook failed to load: {selectedExtension.status_message}</p>
      ) : !selectedExtension?.has_client ? (
        <p className="text-muted">This extension doesn't provide a UI.</p>
      ) : loadError ? (
        <p className="text-muted">{loadError}</p>
      ) : Component ? (
        <ExtensionErrorBoundary key={selectedSlug}>
          <Component api={makeExtensionApi(selectedSlug)} />
        </ExtensionErrorBoundary>
      ) : (
        <div className="loading-container">
          <Spinner animation="border" variant="light" style={{ width: 60, height: 60 }} />
        </div>
      )}
    </div>
  );
}

export default Extensions;
