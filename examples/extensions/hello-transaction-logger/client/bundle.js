// Example Budgett extension UI. A plain, non-module script (no build step) that uses the
// host's global React and registers its component with window.registerBudgettExtension.
(function () {
  const React = window.React;
  const { useState, useEffect } = React;

  function HelloTransactionLogger({ api }) {
    const [log, setLog] = useState(null);

    useEffect(() => {
      let cancelled = false;
      api.getData('log').then((value) => {
        if (!cancelled) {
          setLog(value || []);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [api]);

    if (log === null) {
      return React.createElement('p', null, 'Loading...');
    }

    if (log.length === 0) {
      return React.createElement('p', null, 'No transactions logged yet — sync an account to see entries appear here.');
    }

    return React.createElement('div', null,
      React.createElement('h5', null, 'Recently synced transactions'),
      React.createElement('ul', null, log.map((entry, i) => React.createElement(
        'li', { key: i }, `${entry.date} — ${entry.merchant} — ${entry.amount}`
      )))
    );
  }

  window.registerBudgettExtension('hello-transaction-logger', HelloTransactionLogger);
})();
