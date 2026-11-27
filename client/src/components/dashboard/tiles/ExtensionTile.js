import React, { useEffect, useState } from 'react';
import { loadExtensionScript, getExtensionTileComponent, makeExtensionApi, useExtensionErrors, notRegisteredMessage } from '../../../utils/extensionHost';
import ExtensionErrorBoundary from '../../extensions/ExtensionErrorBoundary';
import ExtensionErrorList from '../../extensions/ExtensionErrorList';
import TileLoading from '../TileLoading';

// Renders a tile registered by an extension's client bundle via window.registerBudgettTile,
// keyed by config.extensionSlug/config.tileId (set once, at add-time, by tileTypes.js - the
// same bundle that registers the extension's full page, if it has one, since both use the
// same loadExtensionScript loader).
function ExtensionTile({ config }) {
  const [Component, setComponent] = useState(() => getExtensionTileComponent(config.extensionSlug, config.tileId));
  const [error, setError] = useState(null);
  // Only errors traced to this extension: the dashboard has other tiles that could fail too
  const runtimeErrors = useExtensionErrors(config.extensionSlug);

  useEffect(() => {
    if (Component) {
      return;
    }

    let cancelled = false;
    loadExtensionScript(config.extensionSlug)
      .then(() => {
        if (!cancelled) {
          const registered = getExtensionTileComponent(config.extensionSlug, config.tileId);
          setComponent(() => registered);
          if (!registered) {
            setError(notRegisteredMessage(config.extensionSlug, `the "${config.tileId}" tile`));
          }
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
    <>
      <ExtensionErrorList errors={runtimeErrors} compact />
      <ExtensionErrorBoundary>
        <Component api={makeExtensionApi(config.extensionSlug)} />
      </ExtensionErrorBoundary>
    </>
  );
}

export default ExtensionTile;
