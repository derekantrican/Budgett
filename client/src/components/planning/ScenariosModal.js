import React, { useEffect, useMemo, useState } from 'react';
import { Button, Modal, Table } from 'react-bootstrap';
import { simulateFlatPayment } from '../../helpers/loanAmortization';
import { formatCurrency } from '../../utils/currency';
import CurrencyInput from '../CurrencyInput';

function scenarioLabel(amount) {
  return `${formatCurrency(Number(amount)).replace(/\.00$/, '')}/mo`;
}

function ScenariosModal({ show, onClose, scenarios, onSave, startBalance, startMonth, startDate, interestRate, pmi, propertyTax, loanAmount }) {
  const [inputs, setInputs] = useState(() => (scenarios.length ? scenarios.map(String) : ['']));

  useEffect(() => {
    if (show) {
      setInputs(scenarios.length ? scenarios.map(String) : ['']);
    }
    // Re-seed from the saved scenarios each time the modal opens, so a prior cancel
    // doesn't leave stale unsaved edits the next time it's opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const addRow = () => setInputs(prev => [...prev, '']);
  const updateRow = (idx, value) => setInputs(prev => prev.map((v, i) => (i === idx ? value : v)));
  const removeRow = (idx) => setInputs(prev => prev.filter((_, i) => i !== idx));

  const results = useMemo(() => {
    return inputs
      .filter(v => v !== '' && Number(v) > 0)
      .map(v => ({
        amount: Number(v),
        ...simulateFlatPayment({
          startBalance,
          startMonth,
          startDate,
          interestRate,
          monthlyPayment: Number(v),
          pmi,
          propertyTax,
          loanAmount,
        }),
      }));
  }, [inputs, startBalance, startMonth, startDate, interestRate, pmi, propertyTax, loanAmount]);

  const showPmiColumn = !!pmi?.enabled;

  const handleSave = () => {
    onSave(inputs.filter(v => v !== '' && Number(v) > 0).map(Number));
    onClose();
  };

  return (
    <Modal show={show} onHide={onClose} data-bs-theme="dark" size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Repayment Scenarios</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted" style={{ fontSize: '0.85em' }}>
          Explore paying a flat monthly amount from the loan's starting balance ({formatCurrency(startBalance)}) forward.
        </p>
        {inputs.map((value, idx) => (
          <div key={idx} className="d-flex gap-2 mb-2 align-items-center">
            <CurrencyInput
              placeholder="Monthly payment"
              value={value}
              onChange={(e) => updateRow(idx, e.target.value)}
            />
            <Button size="sm" variant="outline-danger" onClick={() => removeRow(idx)}>✕</Button>
          </div>
        ))}
        <Button size="sm" variant="outline-light" onClick={addRow} className="mb-3">+ Add Scenario</Button>

        {results.length > 0 && (
          <Table striped hover responsive variant="dark" size="sm">
            <thead>
              <tr>
                <th>Monthly Payment</th>
                <th>Months to Pay Off</th>
                {showPmiColumn && <th>Total PMI</th>}
                <th>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.amount}>
                  <td>{scenarioLabel(r.amount)}</td>
                  <td>{r.payoffPossible ? r.months : 'Never pays off'}</td>
                  {showPmiColumn && <td>{r.payoffPossible ? formatCurrency(r.totalPmi) : '—'}</td>}
                  <td>{r.payoffPossible ? formatCurrency(r.totalCost) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave}>Save & Plot</Button>
      </Modal.Footer>
    </Modal>
  );
}

export default ScenariosModal;
