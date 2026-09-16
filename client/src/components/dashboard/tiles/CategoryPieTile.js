import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Legend, Sector, ResponsiveContainer } from 'recharts';
import { getTransactions } from '../../../services/api';
import { buildCategoryPieData, filterCategoriesForTile } from '../../../helpers/categorySpend';
import TileLoading from '../TileLoading';

function monthRange(now) {
  return [
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0],
  ];
}

function yearRange(now) {
  return [`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`];
}

// Shared by the "This Month" and "This Year" category pie tiles - same chart, different date
// range. Ported from the old Summary page's single hardcoded pie chart.
function CategoryPieTile({ ctx, config, mode }) {
  const [transactions, setTransactions] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const [startDate, endDate] = mode === 'year' ? yearRange(new Date()) : monthRange(new Date());
    setTransactions(null);
    getTransactions(startDate, endDate).then(setTransactions);
  }, [mode]);

  if (!transactions) {
    return <TileLoading />;
  }

  const categories = filterCategoriesForTile(ctx.categories, config);
  const chartData = buildCategoryPieData(categories, transactions);
  if (chartData.length === 0) {
    return <div className="text-muted text-center" style={{ padding: '32px 8px' }}>No spending {mode === 'year' ? 'this year' : 'this month'}.</div>;
  }

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  const renderActiveShape = (props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload } = props;
    return (
      <g>
        <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius} startAngle={startAngle} endAngle={endAngle} fill={fill} />
        <Sector cx={cx} cy={cy} startAngle={startAngle} endAngle={endAngle} innerRadius={outerRadius + 4} outerRadius={outerRadius + 7} fill={fill} />
        <text x={cx} y={cy} dy={6} textAnchor="middle" fill="white" fontSize={12}>{payload.name}</text>
      </g>
    );
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Pie
          data={chartData}
          cx="50%"
          cy="45%"
          isAnimationActive={false}
          labelLine={false}
          label={({ value }) => {
            const pct = (value / total) * 100;
            return pct < 4 ? '' : `${Math.round(pct)}%`;
          }}
          outerRadius="75%"
          innerRadius="42%"
          dataKey="value"
          activeIndex={activeIndex}
          activeShape={renderActiveShape}
          onMouseEnter={(_, index) => setActiveIndex(index)}
          onMouseLeave={() => setActiveIndex(-1)}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CategoryPieMonthTile({ ctx, config }) {
  return <CategoryPieTile ctx={ctx} config={config} mode="month" />;
}

export function CategoryPieYearTile({ ctx, config }) {
  return <CategoryPieTile ctx={ctx} config={config} mode="year" />;
}
