import React from 'react';
import { resetDemoData } from './mockApi';

function DemoBanner() {
  const handleReset = () => {
    if (!window.confirm('Reset all demo data back to the original sample data?')) {
      return;
    }

    resetDemoData();
    window.location.reload();
  };

  return (
    <div style={{ background: 'var(--accent, #4e89ff)', color: '#fff', fontSize: '0.9em', padding: '6px 16px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
      <span>
        This is a demo of <a href="https://github.com/derekantrican/Budgett" style={{ color: '#fff', fontWeight: 'bold' }}>Budgett</a> with made-up data. Your changes are saved only in this browser.
      </span>
      <button type="button" className="btn btn-sm btn-light" style={{ padding: '0 10px' }} onClick={handleReset}>Reset demo data</button>
    </div>
  );
}

export default DemoBanner;
