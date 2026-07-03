import React, { useEffect, useState } from 'react';
import { Spinner } from 'react-bootstrap';
import { PieChart, Pie, Cell, Legend, Sector } from 'recharts';
import { getTransactions, getCategories } from '../services/api';

function Summary() {
  const [categories, setCategories] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    getTransactions(startDate, endDate).then(setTransactions);
    getCategories().then(setCategories);
  }, []);

  if (!categories || !transactions) {
    return (
      <div className="loading-container">
        <Spinner animation="border" variant="success" style={{ width: 80, height: 80 }} />
      </div>
    );
  }

  // Build pie chart data
  const chartData = [];
  const chartColors = [];

  for (const cat of categories) {
    const spent = transactions
      .filter(t => t.splits?.some(s => s.category_id === cat.id))
      .reduce((sum, t) => {
        const catSplits = t.splits.filter(s => s.category_id === cat.id);
        return sum + catSplits.reduce((s, split) => s + split.amount, 0);
      }, 0);

    if (spent < 0) {
      chartData.push({ name: cat.name, value: Math.abs(spent) });
      chartColors.push(cat.color || `hsl(${Math.random() * 360}, 60%, 50%)`);
    }
  }

  // Uncategorized
  const uncategorized = transactions
    .reduce((sum, t) => {
      if (!t.splits || t.splits.length === 0) 
        return sum + t.amount;
      const uncatSplits = t.splits.filter(s => !s.category_id);
      return sum + uncatSplits.reduce((s, split) => s + split.amount, 0);
    }, 0);
  if (uncategorized < 0) {
    chartData.push({ name: 'Uncategorized', value: Math.abs(uncategorized) });
    chartColors.push('#6c757d');
  }

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  const renderActiveShape = (props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload } = props;
    return (
      <g>
        <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius}
          startAngle={startAngle} endAngle={endAngle} fill={fill} />
        <Sector cx={cx} cy={cy} startAngle={startAngle} endAngle={endAngle}
          innerRadius={outerRadius + 6} outerRadius={outerRadius + 10} fill={fill} />
        <text x={cx} y={cy} dy={8} textAnchor="middle" fill="white">
          {payload.name}
        </text>
      </g>
    );
  };

  return (
    <div>
      <h4 style={{ marginBottom: 20 }}>Spending Categories this month</h4>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <PieChart width={600} height={500}>
          <Legend />
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            isAnimationActive={false}
            labelLine={false}
            label={({ value }) => {
              const pct = (value / total) * 100;
              return pct < 1 ? '<1%' : `${Math.round(pct)}%`;
            }}
            outerRadius={180}
            innerRadius={110}
            dataKey="value"
            activeIndex={activeIndex}
            activeShape={renderActiveShape}
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(-1)}
          >
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={chartColors[index]} />
            ))}
          </Pie>
        </PieChart>
      </div>
    </div>
  );
}

export default Summary;
