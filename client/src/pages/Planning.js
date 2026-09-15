import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Form, Spinner } from 'react-bootstrap';
import { getPlanningViews, createPlanningView, getAccounts, getItems, getCategories, getIncome, getSettings } from '../services/api';
import AddViewModal from '../components/planning/AddViewModal';
import { getViewType, getViewSlugs, findViewBySlug } from '../components/planning/viewTypes';

function Planning() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const [views, setViews] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [incomeSources, setIncomeSources] = useState([]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps the selected view and the URL's slug in sync - runs on initial load, whenever the
  // slug changes (bookmarked link, browser back/forward), and after a view is deleted (its
  // slug no longer matches anything, so this falls through to the current/first view).
  useEffect(() => {
    if (!views) {
      return;
    }

    if (!views.length) {
      setSelectedViewId(null);
      if (slug) {
        navigate('/planning', { replace: true });
      }

      return;
    }

    const bySlug = slug ? findViewBySlug(views, slug) : null;
    const current = views.find(v => v.id === selectedViewId);
    const target = bySlug || current || views[0];
    setSelectedViewId(target.id);

    const correctSlug = getViewSlugs(views).get(target.id);
    if (correctSlug !== slug) {
      navigate(`/planning/${correctSlug}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, views]);

  const loadData = async (selectId) => {
    const [viewList, accountList, itemList, categoryList, incomeList] = await Promise.all([
      getPlanningViews(), getAccounts(), getItems(), getCategories(), getIncome(),
    ]);
    const colorByItemId = new Map(itemList.map(i => [i.id, i.display_color || i.institution_color]));
    setViews(viewList);
    setAccounts(accountList.map(a => ({ ...a, institution_color: colorByItemId.get(a.item_id) || null })));
    setCategories(categoryList);
    setIncomeSources(incomeList);

    if (selectId) {
      setSelectedViewId(selectId);
    }
    // The [slug, views] effect above reconciles the URL once `views` (and `selectedViewId`
    // above) update - covers a newly-created view, a rename that changes its slug, and a
    // deletion falling back to whatever view is now first.
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

  const selectView = (id) => {
    const newSlug = getViewSlugs(views).get(id);
    if (newSlug) {
      navigate(`/planning/${newSlug}`);
    }
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
              onChange={(e) => selectView(Number(e.target.value))}
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
          categories={categories}
          incomeSources={incomeSources}
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
