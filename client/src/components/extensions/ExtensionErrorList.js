import React from 'react';

// Errors an extension hit while running (see useExtensionErrors in utils/extensionHost.js),
// shown above it - an extension stuck on its own "Loading..." usually has one of these behind it.
function ExtensionErrorList({ errors, compact = false }) {
  if (!errors.length) {
    return null;
  }

  return (
    <div className="alert alert-warning" style={{ fontSize: compact ? '0.8em' : '0.9em', padding: compact ? '6px 8px' : undefined }}>
      <div style={{ fontWeight: 'bold' }}>This extension hit {errors.length === 1 ? 'an error' : `${errors.length} errors`}:</div>
      <ul className="mb-0 ps-3" style={{ wordBreak: 'break-word' }}>
        {errors.map(message => <li key={message}><code style={{ color: 'inherit' }}>{message}</code></li>)}
      </ul>
    </div>
  );
}

export default ExtensionErrorList;
