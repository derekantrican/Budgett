// Seed data for the GitHub Pages demo build. Everything is generated relative to "today" so the
// demo always shows a current month, and uses a seeded PRNG so "Reset demo data" always rebuilds
// the exact same dataset. All names (banks, merchants, people) are fictional.

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const round2 = (n) => Math.round(n * 100) / 100;

function monthlyPayment(principal, annualRatePct, termMonths) {
  const r = annualRatePct / 100 / 12;
  return round2((principal * r) / (1 - Math.pow(1 + r, -termMonths)));
}

export function buildSeed() {
  const rand = mulberry32(20240601);
  const between = (min, max) => round2(min + rand() * (max - min));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nowStamp = now.toISOString().replace('T', ' ').slice(0, 19);
  const stamp = { created_at: nowStamp, updated_at: nowStamp };

  const items = [
    { id: 1, plaid_item_id: 'demo-item-1', institution_name: 'Evergreen Community Bank', institution_id: 'demo_ins_1', institution_color: '#2e7d32', institution_logo: null, display_name: null, display_icon_url: null, display_color: null, online_banking_url: null, transaction_cursor: null, status: 'ok', ...stamp },
    { id: 2, plaid_item_id: 'demo-item-2', institution_name: 'Summit Card Services', institution_id: 'demo_ins_2', institution_color: '#6a1b9a', institution_logo: null, display_name: null, display_icon_url: null, display_color: null, online_banking_url: null, transaction_cursor: null, status: 'ok', ...stamp },
    { id: 3, plaid_item_id: 'demo-item-3', institution_name: 'Harbor Investments', institution_id: 'demo_ins_3', institution_color: '#1565c0', institution_logo: null, display_name: null, display_icon_url: null, display_color: null, online_banking_url: null, transaction_cursor: null, status: 'ok', ...stamp },
  ];

  const account = (id, itemId, name, type, subtype, mask, current, available, hide = 0) => ({
    id, item_id: itemId, plaid_account_id: `demo-acct-${id}`, name, official_name: name, display_name: null,
    type, subtype, mask, current_balance: current, available_balance: available, online_banking_url: null,
    hide_from_transactions: hide, is_deleted: 0, ...stamp,
  });
  const accounts = [
    account(1, 1, 'Everyday Checking', 'depository', 'checking', '4821', 4212.37, 4112.37),
    account(2, 1, 'High-Yield Savings', 'depository', 'savings', '9930', 18540.12, 18540.12),
    account(3, 2, 'Summit Rewards Visa', 'credit', 'credit card', '1177', 1284.55, 8715.45),
    account(4, 3, '401(k)', 'investment', '401k', '3304', 86420.9, null, 1),
    account(5, 1, 'Home Mortgage', 'loan', 'mortgage', '0062', 291874.21, null, 1),
  ];
  const CHECKING = 1, SAVINGS = 2, CARD = 3;

  const categoryDefs = [
    ['Paycheck', '#82E0AA', '=income_net', 1],
    ['Side Income', '#A3E4D7', '=40*3*saturdays', 1],
    ['Mortgage', '#85C1E9', '-2255.30', 1],
    ['Groceries', '#4ECDC4', '=-125*sundays', 1],
    ['Dining Out', '#FF6B6B', '-250', 1],
    ['Gas', '#F8C471', '=-45*fridays', 1],
    ['Utilities', '#45B7D1', '-260', 1],
    ['Subscriptions', '#BB8FCE', '-35', 1],
    ['Shopping', '#F1948A', '-200', 1],
    ['Entertainment', '#DDA0DD', '-120', 1],
    ['Health', '#98D8C8', '-80', 1],
    ['Gifts', '#F7DC6F', '-50', 0],
  ];
  const categories = categoryDefs.map(([name, color, expr, reset], i) => ({
    id: i + 1, name, color, budgeted_amount_expression: expr, reset_on_new_month: reset,
    is_hidden: 0, sort_order: i, ...stamp,
  }));
  const cat = Object.fromEntries(categories.map(c => [c.name, c.id]));

  const transactions = [];
  const splits = [];
  let txnId = 1;
  let splitId = 1;

  function addTxn({ date, merchant, amount, accountId, category, notes = null, pending = false, plaid = true, hidden = false, extra = {} }) {
    const id = txnId++;
    transactions.push({
      id, plaid_transaction_id: plaid ? `demo-txn-${id}` : null, pending_transaction_id: null,
      account_id: accountId, group_id: null, date, merchant, amount: round2(amount),
      is_pending: pending ? 1 : 0, is_removed: 0, is_hidden: hidden ? 1 : 0, is_auth: 0, is_transfer: 0,
      linked_transaction_id: null, matched_manual_id: null, notes: null, plaid_category: null, plaid_raw_json: null,
      ...stamp, ...extra,
    });
    if (category !== undefined) {
      splits.push({ id: splitId++, transaction_id: id, category_id: category, amount: round2(amount), amount_formula: null, notes, ...stamp });
    }

    return id;
  }

  function addTransfer(date, amount, fromId, toId, fromMerchant, toMerchant) {
    const outId = addTxn({ date, merchant: fromMerchant, amount: -amount, accountId: fromId, hidden: true });
    const inId = addTxn({ date, merchant: toMerchant, amount, accountId: toId, hidden: true });
    Object.assign(transactions.find(t => t.id === outId), { is_transfer: 1, linked_transaction_id: inId });
    Object.assign(transactions.find(t => t.id === inId), { is_transfer: 1, linked_transaction_id: outId });
  }

  // Income: a biweekly salary whose net matches the income source card below, plus a monthly
  // per-lesson side gig.
  const salary = 82000;
  const grossPerCheck = salary / 26;
  const netPerCheck = round2(grossPerCheck - grossPerCheck * 0.12 - grossPerCheck * 0.06 - 95);

  const startMonth = new Date(today.getFullYear(), today.getMonth() - 12, 1);
  // Anchor the biweekly cycle on a Friday in the first seeded month.
  const firstPayday = new Date(startMonth);
  while (firstPayday.getDay() !== 5) {
    firstPayday.setDate(firstPayday.getDate() + 1);
  }

  for (let d = new Date(firstPayday); d <= today; d.setDate(d.getDate() + 14)) {
    addTxn({ date: iso(d), merchant: 'Northwind Logistics Payroll', amount: netPerCheck, accountId: CHECKING, category: cat.Paycheck });
  }

  const loanAmount = 320000;
  const loanRate = 6.25;
  const propertyTax = 285;
  const mortgagePayment = round2(monthlyPayment(loanAmount, loanRate, 360) + propertyTax);
  categories.find(c => c.id === cat.Mortgage).budgeted_amount_expression = String(-mortgagePayment);
  const loanStart = new Date(today.getFullYear() - 3, today.getMonth(), 1);

  const groceryStores = ['Harvest Grocery', 'Corner Market', 'Bulk Barn Warehouse', 'Green Valley Co-op'];
  const restaurants = ["Luigi's Trattoria", 'Taco Shack', 'Bean There Coffee', 'Pho Real', 'Burger Barn', 'Sakura Sushi'];
  const gasStations = ['QuickFuel #212', 'Pinecrest Gas'];
  const shops = ['Online Marketplace', 'Hometown Hardware', 'Bookworm Books', 'Threadline Apparel'];
  const fun = ['Starlight Cinema 8', 'Lucky Strike Lanes', 'Pixel Palace Games', 'City Museum'];
  const health = ['Wellness Pharmacy', 'Lakeside Family Practice', 'Bright Smile Dental'];

  for (let m = new Date(startMonth); m <= today; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const y = m.getFullYear();
    const mo = m.getMonth();
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    const on = (day) => {
      const d = new Date(y, mo, Math.min(day, daysInMonth));
      return d <= today ? iso(d) : null;
    };

    const add = (day, opts) => {
      const date = on(day);
      if (date) {
        addTxn({ date, ...opts });
      }
    };

    add(1, { merchant: 'Evergreen Mortgage Payment', amount: -mortgagePayment, accountId: CHECKING, category: cat.Mortgage });
    add(5, { merchant: 'FiberLink Internet', amount: -70, accountId: CHECKING, category: cat.Utilities });
    // Electric runs higher in summer and winter.
    const seasonal = [1.3, 1.2, 1.0, 0.85, 0.9, 1.15, 1.4, 1.45, 1.1, 0.9, 1.0, 1.25][mo];
    add(12, { merchant: 'Riverbend Electric Co', amount: -between(85, 105) * seasonal, accountId: CHECKING, category: cat.Utilities });
    add(18, { merchant: 'City Water & Sewer', amount: -between(38, 52), accountId: CHECKING, category: cat.Utilities });
    add(7, { merchant: 'StreamFlix', amount: -15.49, accountId: CARD, category: cat.Subscriptions });
    add(14, { merchant: 'Tunewave Music', amount: -10.99, accountId: CARD, category: cat.Subscriptions });
    add(20, { merchant: 'CloudVault Storage', amount: -2.99, accountId: CARD, category: cat.Subscriptions });

    // Side gig pays out at the end of the month for that month's Saturday lessons.
    let saturdays = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      if (new Date(y, mo, day).getDay() === 6) {
        saturdays++;
      }
    }

    add(daysInMonth, { merchant: 'Melody Lane Music School', amount: 40 * 3 * saturdays, accountId: CHECKING, category: cat['Side Income'], notes: `${3 * saturdays} lessons` });

    for (let day = 1; day <= daysInMonth; day++) {
      const dow = new Date(y, mo, day).getDay();
      if (dow === 0) {
        add(day, { merchant: pick(groceryStores), amount: -between(85, 165), accountId: rand() < 0.6 ? CHECKING : CARD, category: cat.Groceries });
      }

      if (dow === 5 && rand() < 0.85) {
        add(day, { merchant: pick(gasStations), amount: -between(32, 54), accountId: CARD, category: cat.Gas });
      }
    }

    const scatter = (count, merchants, min, max, category, accountId = CARD) => {
      for (let i = 0; i < count; i++) {
        add(1 + Math.floor(rand() * daysInMonth), { merchant: pick(merchants), amount: -between(min, max), accountId, category });
      }
    };

    scatter(5 + Math.floor(rand() * 4), restaurants, 6, 68, cat['Dining Out']);
    scatter(2 + Math.floor(rand() * 3), shops, 15, 140, cat.Shopping);
    scatter(1 + Math.floor(rand() * 2), fun, 14, 60, cat.Entertainment);
    scatter(Math.floor(rand() * 2), health, 12, 90, cat.Health);
    if (rand() < 0.35) {
      scatter(1, ['Petal & Stem Florist', 'Giftly Shop'], 25, 90, cat.Gifts);
    }

    // Monthly savings transfer and credit card payment, linked as hidden transfer pairs (they
    // show up on Settings > Money Movement rather than cluttering Transactions).
    const savingsDate = on(15);
    if (savingsDate) {
      addTransfer(savingsDate, 400, CHECKING, SAVINGS, 'Transfer to Savings', 'Transfer from Checking');
    }

    const cardDate = on(25);
    if (cardDate) {
      const prevMonthCardSpend = transactions
        .filter(t => t.account_id === CARD && !t.is_transfer && t.date < iso(new Date(y, mo, 1)) && t.date >= iso(new Date(y, mo - 1, 1)))
        .reduce((sum, t) => sum - t.amount, 0);
      if (prevMonthCardSpend > 0) {
        addTransfer(cardDate, round2(prevMonthCardSpend), CHECKING, CARD, 'Summit Card Autopay', 'Payment - Thank You');
      }
    }
  }

  // A few hand-picked recent transactions to show off splits, pending, and incomplete states.
  const daysAgo = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return iso(d);
  };

  const splitTxnId = addTxn({ date: daysAgo(4), merchant: 'Bulk Barn Warehouse', amount: -212.48, accountId: CARD });
  splits.push(
    { id: splitId++, transaction_id: splitTxnId, category_id: cat.Groceries, amount: -138.2, amount_formula: null, notes: 'Weekly groceries', ...stamp },
    { id: splitId++, transaction_id: splitTxnId, category_id: cat.Shopping, amount: -74.28, amount_formula: '=amount+138.20', notes: 'Patio chairs', ...stamp },
  );
  addTxn({ date: daysAgo(1), merchant: 'Bean There Coffee', amount: -6.75, accountId: CARD, category: cat['Dining Out'], pending: true });
  addTxn({ date: daysAgo(0), merchant: 'QuickFuel #212', amount: -41.18, accountId: CARD, category: cat.Gas, pending: true });
  addTxn({ date: daysAgo(2), merchant: 'SQ *FARMERS MKT STAND', amount: -18.5, accountId: CHECKING });
  addTxn({ date: daysAgo(3), merchant: 'Sakura Sushi', amount: -42, accountId: CARD, category: cat['Dining Out'], plaid: false, notes: 'Birthday dinner - recorded by hand, waiting for the card charge to post' });

  const incomeSources = [
    {
      id: 1, name: 'Northwind Logistics', type: 'salary', amount: salary, quantity_per_period: null, unit_label: null,
      pay_period: 'biweekly', payday_weekday: null, reference_pay_date: iso(firstPayday),
      adjustments_json: JSON.stringify([
        { name: 'Federal tax', kind: 'percent', value: 12 },
        { name: '401(k)', kind: 'percent', value: 6 },
        { name: 'Health insurance', kind: 'fixed', value: 95 },
      ]),
      is_archived: 0, ...stamp,
    },
    {
      id: 2, name: 'Piano lessons', type: 'commission', amount: 40, quantity_per_period: '=3*saturdays', unit_label: 'lesson',
      pay_period: 'monthly', payday_weekday: null, reference_pay_date: null, adjustments_json: '[]', is_archived: 0, ...stamp,
    },
  ];

  const rules = [
    { id: 1, pattern: 'QUICKFUEL|PINECREST', condition: null, category_id: cat.Gas, merchant_template: null, notes_template: null, amount_expression: null, payment_method: null, is_split: 0, split_json: null, expires_at: null, is_auto_created: 0, is_disabled: 0, amount_condition: null, rename_to: null, ...stamp },
    { id: 2, pattern: 'STREAMFLIX', condition: null, category_id: cat.Subscriptions, merchant_template: null, notes_template: null, amount_expression: null, payment_method: null, is_split: 0, split_json: null, expires_at: null, is_auto_created: 0, is_disabled: 0, amount_condition: null, rename_to: 'StreamFlix', ...stamp },
    { id: 3, pattern: 'Harvest Grocery', condition: null, category_id: cat.Groceries, merchant_template: null, notes_template: null, amount_expression: null, payment_method: null, is_split: 0, split_json: null, expires_at: null, is_auto_created: 1, is_disabled: 0, amount_condition: null, rename_to: null, ...stamp },
  ];

  const recordTemplates = [
    { id: 1, name: 'Morning coffee', merchant: 'Bean There Coffee', notes: null, category_id: cat['Dining Out'], account_id: CARD, amount: -5.25, ...stamp },
    { id: 2, name: 'Farmers market', merchant: 'Farmers Market', notes: null, category_id: cat.Groceries, account_id: CHECKING, amount: null, ...stamp },
  ];

  const planningViews = [
    {
      id: 1, type: 'loan_amortization', name: 'Mortgage', sort_order: 0, ...stamp,
      config_json: JSON.stringify({
        loanAmount, interestRate: loanRate, termMonths: 360, startingMonth: 1, startDate: iso(loanStart), linkedAccountId: 5,
        pmi: { enabled: false, monthlyAmount: '', removalType: 'none', removalMonth: '', originalLoanAmount: '', removalPercent: 80 },
        propertyTax: { monthlyAmount: propertyTax, adjustments: [] },
        scenarios: [2500, 3000],
      }),
    },
    {
      id: 2, type: 'retirement', name: 'Retirement', sort_order: 1, ...stamp,
      config_json: JSON.stringify({
        birthDate: '1990-04-12', retirementAge: 65,
        assets: [
          { id: 'a1', type: 'linked', accountId: 4, label: '', balance: '', returnRate: 7 },
          { id: 'a2', type: 'manual', accountId: '', label: 'Roth IRA', balance: 24000, returnRate: 7 },
        ],
        monthlyContribution: 410, annualContributionIncrease: 2, contributionReturnRate: 7, scenarioSpread: 2,
        employerMatch: { enabled: true, monthlyAmount: 205 },
      }),
    },
    {
      id: 3, type: 'emergency_fund', name: 'Emergency Fund', sort_order: 2, ...stamp,
      config_json: JSON.stringify({
        essentialCategoryIds: [cat.Mortgage, cat.Groceries, cat.Gas, cat.Utilities, cat.Health],
        monthsOfCoverage: 6, fundAccountIds: [SAVINGS], backupAccountIds: [CHECKING], additionalMonthlyIncome: 0,
        categoryPercentages: { [cat.Groceries]: 80, [cat.Gas]: 70 }, marginPercent: 10,
      }),
    },
  ];

  const tile = (id, type, config, x, y, w, h) => ({ id, type, config_json: JSON.stringify(config), x, y, w, h, ...stamp });
  const dashboardTiles = [
    tile(1, 'balances_table', { accountIds: [CHECKING, SAVINGS, CARD, 4] }, 0, 0, 4, 8),
    tile(2, 'categories_table', { categoryIds: [cat.Groceries, cat['Dining Out'], cat.Gas, cat.Shopping, cat.Entertainment] }, 4, 0, 4, 8),
    tile(3, 'category_pie_month', { categoryIds: [] }, 8, 0, 4, 8),
    tile(4, 'income_cards', { incomeSourceIds: null }, 0, 8, 6, 9),
    tile(5, 'emergency_fund_table', { viewId: 3 }, 6, 8, 6, 9),
    tile(6, 'loan_amortization_graph', { viewId: 1 }, 0, 17, 6, 9),
    tile(7, 'retirement_graph', { viewId: 2 }, 6, 17, 6, 9),
    tile(8, 'category_year_table', { categoryIds: [] }, 0, 26, 12, 10),
  ];

  return {
    items,
    accounts,
    categories,
    transactions,
    transaction_splits: splits,
    income_sources: incomeSources,
    rules,
    record_templates: recordTemplates,
    planning_views: planningViews,
    dashboard_tiles: dashboardTiles,
    app_settings: { date_format: 'MMM D, YYYY', number_format: '1,000.00', plaid_env: 'sandbox' },
  };
}
