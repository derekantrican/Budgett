import React from 'react';
import LoanAmortizationView from './LoanAmortizationView';
import RetirementView from './RetirementView';
import EmergencyFundView from './EmergencyFundView';

// Small inline-SVG thumbnails used as previews in the "Add View" picker.
function LoanThumbnail() {
  return (
    <svg viewBox="0 0 100 60" width="100%" height="100%">
      <polyline points="4,10 4,50 96,50" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" />
      <path d="M4,14 C 30,16 55,30 96,48" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function RetirementThumbnail() {
  return (
    <svg viewBox="0 0 100 60" width="100%" height="100%">
      <polyline points="4,10 4,50 96,50" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" />
      <path d="M4,46 C 30,44 55,30 96,8" fill="none" stroke="var(--success)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function EmergencyFundThumbnail() {
  return (
    <svg viewBox="0 0 100 60" width="100%" height="100%">
      <rect x="30" y="14" width="40" height="34" rx="4" fill="none" stroke="var(--warning)" strokeWidth="3" />
      <line x1="30" y1="28" x2="70" y2="28" stroke="var(--warning)" strokeWidth="3" />
      <line x1="50" y1="6" x2="50" y2="14" stroke="var(--warning)" strokeWidth="3" />
    </svg>
  );
}

// Registry of Planning view types. Each entry describes how it shows up in the
// "Add View" picker and, for implemented types, which component renders it.
const VIEW_TYPES = [
  {
    type: 'loan_amortization',
    label: 'Loan Amortization Table',
    description: 'Track a mortgage or other loan’s payment schedule, balance, and payoff date.',
    Thumbnail: LoanThumbnail,
    Component: LoanAmortizationView,
    defaultConfig: {},
    defaultName: 'Loan Amortization',
  },
  {
    type: 'retirement',
    label: 'Retirement Growth',
    description: 'Project retirement account growth over time.',
    Thumbnail: RetirementThumbnail,
    Component: RetirementView,
    defaultConfig: {},
    defaultName: 'Retirement',
  },
  {
    type: 'emergency_fund',
    label: 'Emergency Fund',
    description: 'Estimate how large your emergency fund should be based on essential categories.',
    Thumbnail: EmergencyFundThumbnail,
    Component: EmergencyFundView,
    defaultConfig: {},
    defaultName: 'Emergency Fund',
  },
];

export const getViewType = (type) => VIEW_TYPES.find(v => v.type === type);

export default VIEW_TYPES;
