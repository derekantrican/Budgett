import React, { useEffect, useState } from 'react';
import { Button, Form, Spinner } from 'react-bootstrap';
import { getPlanningViews, createPlanningView, getAccounts, getSettings } from '../services/api';
import AddViewModal from '../components/planning/AddViewModal';
import { getViewType } from '../components/planning/viewTypes';

/*
  Planning can include several sub-views like:
  - "Mortgage" (eg amortization table - can be attached to an added account if the user can add
    their mortgage account or values can be manually specified)
  - "Retirement" (basic retirement growth calculation & graph - again, amounts can either be
    manually added or attached to plaid-linked accounts)
  - "Emergency Fund" (choosing different categories from the categories list that would or would
    not be included if the user had to live entirely off of an emergency fund and therefore how
    large of a fund the user should have based on X months of this. Also, linking to plaid-linked
    account(s) that might track an existing emergency fund)
*/

function Planning() {
  const [views, setViews] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedViewId, setSelectedViewId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [dateFormat, setDateFormat] = useState('MMM D, YYYY');

  useEffect(() => {
    loadData();
    getSettings().then(s => {
      if (s.date_format) {
        setDateFormat(s.date_format);
      }
    });
  }, []);

  const loadData = async (selectId) => {
    const [viewList, accountList] = await Promise.all([getPlanningViews(), getAccounts()]);
    setViews(viewList);
    setAccounts(accountList);
    setSelectedViewId(prev => {
      if (selectId) {
        return selectId;
      }

      if (prev && viewList.some(v => v.id === prev)) {
        return prev;
      }

      return viewList.length ? viewList[0].id : null;
    });
  };

  const handleChooseType = async (viewType) => {
    const result = await createPlanningView({
      type: viewType.type,
      name: viewType.defaultName,
      config: viewType.defaultConfig,
    });
    setShowAddModal(false);
    await loadData(result.id);
  };

  if (!views) {
    return (
      <div className="loading-container">
        <Spinner animation="border" variant="light" style={{ width: 60, height: 60 }} />
      </div>
    );
  }

  const selectedView = views.find(v => v.id === selectedViewId) || null;
  const selectedViewType = selectedView ? getViewType(selectedView.type) : null;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3" style={{ gap: 12, flexWrap: 'wrap' }}>
        <h4 className="mb-0">Planning</h4>
        <div className="d-flex align-items-center" style={{ gap: 12 }}>
          {views.length > 0 && (
            <Form.Select
              value={selectedViewId || ''}
              onChange={(e) => setSelectedViewId(Number(e.target.value))}
              style={{ minWidth: 200 }}
            >
              {views.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </Form.Select>
          )}
          <Button variant="primary" style={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setShowAddModal(true)}>+ Add View</Button>
        </div>
      </div>

      {views.length === 0 ? (
        <div className="text-center" style={{ padding: '64px 16px' }}>
          <p className="text-muted">You haven’t added any planning views yet.</p>
          <Button variant="primary" style={{ whiteSpace: 'nowrap' }} onClick={() => setShowAddModal(true)}>+ Add View</Button>
        </div>
      ) : selectedView && selectedViewType?.Component ? (
        <selectedViewType.Component
          view={selectedView}
          accounts={accounts}
          dateFormat={dateFormat}
          onUpdated={() => loadData(selectedView.id)}
          onDeleted={() => loadData()}
        />
      ) : (
        <p className="text-muted">This view type isn’t supported yet.</p>
      )}

      <AddViewModal show={showAddModal} onClose={() => setShowAddModal(false)} onChoose={handleChooseType} />
    </div>
  );
}

export default Planning;
