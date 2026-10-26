import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './components/Navigation';
import Summary from './pages/Summary';
import Transactions from './pages/Transactions';
import Categories from './pages/Categories';
import Income from './pages/Income';
import Planning from './pages/Planning';
import Extensions from './pages/Extensions';
import RecordTransaction from './pages/RecordTransaction';
import Settings from './pages/Settings';
import AdminLogs from './pages/admin/Logs';
import AdminWebhooks from './pages/admin/Webhooks';
import AdminIncomplete from './pages/admin/IncompleteTransactions';
import AdminMoneyMovement from './pages/admin/MoneyMovement';
import AdminRules from './pages/admin/Rules';
import AdminTemplates from './pages/admin/Templates';
import { getSettings } from './services/api';
import { setCurrencySettings } from './utils/currency';
import { IS_DEMO } from './demo/isDemo';

// Required conditionally (like the mock API in services/api.js) so normal builds don't bundle it
const DemoBanner = process.env.REACT_APP_DEMO === 'true' ? require('./demo/DemoBanner').default : null;

function App() {
  useEffect(() => {
    getSettings().then(setCurrencySettings);
  }, []);

  return (
    <div>
      {IS_DEMO && <DemoBanner />}
      <Navigation />
      <div className="container-fluid mt-3">
        <Routes>
          <Route path="/" element={<Summary />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/income" element={<Income />} />
          <Route path="/planning" element={<Planning />} />
          <Route path="/planning/:slug" element={<Planning />} />
          <Route path="/extensions" element={<Extensions />} />
          <Route path="/extensions/:slug" element={<Extensions />} />
          <Route path="/recordTransaction" element={<RecordTransaction />} />
          <Route path="/settings" element={<Settings />} />
          {/* Logs and webhook payloads only exist on a real server */}
          {!IS_DEMO && <Route path="/settings/logs" element={<AdminLogs />} />}
          {!IS_DEMO && <Route path="/settings/webhooks" element={<AdminWebhooks />} />}
          <Route path="/settings/incomplete" element={<AdminIncomplete />} />
          <Route path="/settings/money-movement" element={<AdminMoneyMovement />} />
          <Route path="/settings/rules" element={<AdminRules />} />
          <Route path="/settings/templates" element={<AdminTemplates />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
