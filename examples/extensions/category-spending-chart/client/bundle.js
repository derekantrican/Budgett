// Example Budgett extension: a category picker + a hand-rolled SVG bar chart of that
// category's spending per month for the current year so far. No server hook — this extension
// only reads data (via the app's own REST API, same-origin) and draws a UI with it.
//
// Also demonstrates calling out to an external service from an extension's UI on a user
// action (not tied to the backend event system) — see handleSendWebhook below.
(function () {
  const React = window.React;
  const { useState, useEffect, useCallback } = React;

  // Set this to try the "Send to Webhook" button (e.g. a webhook.site URL for testing).
  // Left blank by default so the button just prompts you to set it.
  const WEBHOOK_URL = '';

  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function CategorySpendingChart() {
    const [categories, setCategories] = useState(null);
    const [transactions, setTransactions] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [sending, setSending] = useState(false);
    const [containerWidth, setContainerWidth] = useState(600);
    // The chart div below only exists once categories/transactions have loaded (before that,
    // this component renders a "Loading..." paragraph instead) — a plain useRef + a mount-only
    // effect would miss it, since the ref is still null when that effect first runs. A callback
    // ref re-fires whenever the DOM node it's attached to actually changes, so track the node
    // itself in state and let the effect below depend on it.
    const [containerEl, setContainerEl] = useState(null);
    const containerRef = useCallback((el) => setContainerEl(el), []);

    useEffect(() => {
      if (!containerEl) {
        return;
      }

      const observer = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
      observer.observe(containerEl);
      return () => observer.disconnect();
    }, [containerEl]);

    useEffect(() => {
      fetch('/api/categories').then(r => r.json()).then((cats) => {
        setCategories(cats);
        if (cats.length > 0) {
          setSelectedId(cats[0].id);
        }
      });

      const now = new Date();
      const startDate = `${now.getFullYear()}-01-01`;
      const endDate = now.toISOString().split('T')[0];
      fetch(`/api/transactions?start_date=${startDate}&end_date=${endDate}`)
        .then(r => r.json())
        .then(setTransactions);
    }, []);

    if (!categories || !transactions) {
      return React.createElement('p', null, 'Loading...');
    }

    if (categories.length === 0) {
      return React.createElement('p', null, 'No categories yet — add one in Budgett first.');
    }

    const now = new Date();
    const monthCount = now.getMonth() + 1;
    const monthlyTotals = new Array(monthCount).fill(0);

    for (const txn of transactions) {
      const month = new Date(txn.date).getMonth();
      if (month >= monthCount) {
        continue;
      }

      const catSplits = (txn.splits || []).filter(s => s.category_id === selectedId);
      // amount is negative for expenses (Budgett convention) — negate so "spent" is positive.
      const spent = catSplits.reduce((sum, s) => sum - s.amount, 0);
      monthlyTotals[month] += spent;
    }

    const max = Math.max(1, ...monthlyTotals);
    const gap = 16;
    // Derive bar width from the measured container width so bars fill the available space at
    // their natural (uniform) scale — stretching a fixed-size chart with preserveAspectRatio
    // "none" would distort rounded corners and text instead of just widening the bars.
    const barWidth = Math.max(8, (containerWidth - gap * (monthCount - 1)) / monthCount);
    const chartHeight = 320;
    // Reserve headroom above the tallest bar for its value label — without this, the max-value
    // bar reaches all the way to y=0 and its label (drawn just above the bar) ends up at a
    // negative y, which the SVG clips instead of showing.
    const topPadding = 24;
    const plotHeight = chartHeight - topPadding;

    const bars = monthlyTotals.map((total, i) => {
      const barHeight = (Math.max(total, 0) / max) * plotHeight;
      const barTop = chartHeight - barHeight;
      return React.createElement('g', { key: i, transform: `translate(${i * (barWidth + gap)}, 0)` },
        React.createElement('rect', {
          x: 0,
          y: barTop,
          width: barWidth,
          height: barHeight,
          fill: '#4e89ff',
          rx: 3,
        }),
        total > 0 ? React.createElement('text', {
          x: barWidth / 2,
          y: barTop - 6,
          textAnchor: 'middle',
          fontSize: 11,
          fill: '#fff',
        }, `$${total.toFixed(0)}`) : null,
        React.createElement('text', {
          x: barWidth / 2, y: chartHeight + 16, textAnchor: 'middle', fontSize: 11, fill: '#ccc',
        }, MONTH_LABELS[i]));
    });

    const handleSendWebhook = async () => {
      if (!WEBHOOK_URL) {
        alert('Set WEBHOOK_URL at the top of examples/extensions/category-spending-chart/client/bundle.js first.');
        return;
      }

      const categoryName = categories.find(c => c.id === selectedId)?.name || 'Unknown';
      const lines = monthlyTotals.map((total, i) => `${MONTH_LABELS[i]}: $${total.toFixed(2)}`);
      // Discord's webhook API rejects a payload with no recognized message field ("Cannot send
      // an empty message", code 50006) — it expects `content` (plain text) or `embeds`, not
      // arbitrary JSON. If you point WEBHOOK_URL at something other than Discord, swap this
      // body for whatever shape that service expects instead.
      const content = `**${categoryName}** spending by month:\n${lines.join('\n')}`;

      setSending(true);
      try {
        const res = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`);
        }
      }
      catch (err) {
        alert(`Webhook call failed: ${err.message}`);
      }
      finally {
        setSending(false);
      }
    };

    return React.createElement('div', null,
      React.createElement('div', { style: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 } },
        React.createElement('label', null, 'Category:'),
        React.createElement('select', {
          value: selectedId || '',
          onChange: (e) => setSelectedId(Number(e.target.value)),
        }, categories.map(c => React.createElement('option', { key: c.id, value: c.id }, c.name))),
        React.createElement('button', { onClick: handleSendWebhook, disabled: sending }, sending ? 'Sending...' : 'Send to Webhook')
      ),
      React.createElement('div', { ref: containerRef, style: { width: '100%' } },
        React.createElement('svg', { width: containerWidth, height: chartHeight + 30 }, bars)
      )
    );
  }

  window.registerBudgettExtension('category-spending-chart', CategorySpendingChart);
})();
