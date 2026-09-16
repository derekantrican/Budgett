import React, { useEffect, useState } from 'react';
import { loadExtensionScript, getExtensionTileComponent, makeExtensionApi } from '../../../utils/extensionHost';
import ExtensionErrorBoundary from '../../extensions/ExtensionErrorBoundary';
import TileLoading from '../TileLoading';

// Renders a tile registered by an extension's client bundle via window.registerBudgettTile,
// keyed by config.extensionSlug/config.tileId (set once, at add-time, by tileTypes.js - the
// same bundle that registers the extension's full page, if it has one, since both use the
// same loadExtensionScript loader).
function ExtensionTile({ config }) {
  const [Component, setComponent] = useState(() => getExtensionTileComponent(config.extensionSlug, config.tileId));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (Component) {
      return;
    }

    let cancelled = false;
    loadExtensionScript(config.extensionSlug)
      .then(() => {
        if (!cancelled) {
          setComponent(() => getExtensionTileComponent(config.extensionSlug, config.tileId));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.extensionSlug, config.tileId]);

  if (error) {
    return <div className="text-muted text-center" style={{ padding: '32px 8px' }}>{error}</div>;
  }

  if (!Component) {
    return <TileLoading />;
  }

  return (
    <ExtensionErrorBoundary>
      <Component api={makeExtensionApi(config.extensionSlug)} />
    </ExtensionErrorBoundary>
  );
}

export default ExtensionTile;
