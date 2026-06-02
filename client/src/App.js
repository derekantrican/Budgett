import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './components/Navigation';
import Summary from './pages/Summary';
import Transactions from './pages/Transactions';
import Categories from './pages/Categories';
import Income from './pages/Income';
import RecordTransaction from './pages/RecordTransaction';
import Settings from './pages/Settings';
import AdminLogs from './pages/admin/Logs';
import AdminWebhooks from './pages/admin/Webhooks';
import AdminIncomplete from './pages/admin/IncompleteTransactions';

function App() {
  return (
    <div>
      <Navigation />
      <div className="container-fluid mt-3">
        <Routes>
          <Route path="/" element={<Summary />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/income" element={<Income />} />
          <Route path="/record" element={<RecordTransaction />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/logs" element={<AdminLogs />} />
          <Route path="/settings/webhooks" element={<AdminWebhooks />} />
          <Route path="/settings/incomplete" element={<AdminIncomplete />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
