// Live updates: the server broadcasts DATA_CHANGED { resources: [...] } over socket.io whenever data
// changes (a sync brings in transactions, another browser edits something - see
// server/helpers/liveUpdates.js), and pages use the useLiveUpdates hook below to refetch.
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { IS_DEMO } from '../demo/isDemo';

const DATA_CHANGED_EVENT = 'DATA_CHANGED';

// How long to wait for more changes before refetching, so e.g. a sync that brings in 50
// transactions causes one reload rather than 50
const DEFAULT_DELAY_MS = 500;

let socket = null;

// One shared connection, opened the first time a page subscribes (so not before login - with
// REQUIRE_LOGIN the server rejects the handshake without a session cookie).
function getSocket() {
  if (IS_DEMO) {
    return null;
  }

  if (!socket) {
    socket = io({ withCredentials: true });
  }
  else if (!socket.connected && !socket.active) {
    // The server rejected an earlier attempt (e.g. the session expired) - socket.io doesn't
    // retry those by itself, so try again now that a page is asking (i.e. we're logged in again)
    socket.connect();
  }

  return socket;
}

// Sent with each API request (X-Socket-Id) so the server doesn't echo our own changes back to us
export function getSocketId() {
  return socket?.connected ? socket.id : null;
}

// Calls `onChange` (debounced) whenever the server reports a change to any of `resources`
// (e.g. ['transactions', 'categories']; '*' = any change), and after reconnecting, since changes
// may have been missed while disconnected. While the tab is hidden, the reload waits until the
// tab is visible again.
//
// `onChange` should reload the page's data without resetting UI state (open modals, form input,
// scroll position) - it always sees the latest props/state, so it can be an inline function.
export function useLiveUpdates(resources, onChange, delay = DEFAULT_DELAY_MS) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const resourcesKey = resources.join(',');

  useEffect(() => {
    const s = getSocket();
    if (!s) {
      return undefined;
    }

    const wanted = resourcesKey.split(',');
    let timer = null;
    let pendingWhileHidden = false;

    const run = () => {
      if (document.hidden) {
        pendingWhileHidden = true;
        return;
      }

      onChangeRef.current();
    };

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(run, delay);
    };

    const handleDataChanged = ({ resources: changed = [] } = {}) => {
      if (wanted.includes('*') || changed.some(r => wanted.includes(r))) {
        schedule();
      }
    };

    // 'connect' also fires on the first connection - only a REconnect can have missed changes
    let hasConnected = s.connected;
    const handleConnect = () => {
      if (hasConnected) {
        schedule();
      }

      hasConnected = true;
    };

    const handleVisibility = () => {
      if (!document.hidden && pendingWhileHidden) {
        pendingWhileHidden = false;
        onChangeRef.current();
      }
    };

    s.on(DATA_CHANGED_EVENT, handleDataChanged);
    s.on('connect', handleConnect);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimeout(timer);
      s.off(DATA_CHANGED_EVENT, handleDataChanged);
      s.off('connect', handleConnect);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [resourcesKey, delay]);
}
