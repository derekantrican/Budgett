import React from 'react';
import Select from 'react-select';

const darkStyles = {
  control: (base, state) => ({
    ...base,
    backgroundColor: 'var(--bg-secondary, #2b3035)',
    borderColor: state.isFocused ? '#86b7fe' : 'var(--border-color, #495057)',
    boxShadow: state.isFocused ? '0 0 0 0.25rem rgba(13,110,253,.25)' : 'none',
    minHeight: 38,
    width: 207,
    flexWrap: 'nowrap',
    '&:hover': { borderColor: '#86b7fe' },
  }),
  valueContainer: (base) => ({
    ...base,
    overflow: 'hidden',
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: 'var(--bg-secondary, #2b3035)',
    border: '1px solid var(--border-color, #495057)',
    zIndex: 9999,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? '#0d6efd' : 'transparent',
    color: state.isFocused ? '#fff' : 'var(--text-primary, #dee2e6)',
    cursor: 'pointer',
    padding: '6px 12px',
  }),
  singleValue: (base) => ({
    ...base,
    color: 'var(--text-primary, #dee2e6)',
  }),
  input: (base) => ({
    ...base,
    color: 'var(--text-primary, #dee2e6)',
    margin: 0,
    padding: 0,
  }),
  placeholder: (base) => ({
    ...base,
    color: 'var(--text-secondary, #6c757d)',
  }),
  indicatorSeparator: () => ({ display: 'none' }),
  dropdownIndicator: (base) => ({
    ...base,
    padding: '4px',
    color: 'var(--text-secondary, #6c757d)',
  }),
};

function CategorySelect({ categories, value, onChange, placeholder = '— No category —' }) {
  const options = [
    { value: '', label: placeholder },
    ...categories.filter(c => !c.is_hidden).map(c => ({ value: String(c.id), label: c.name })),
  ];

  const selected = options.find(o => o.value === String(value || '')) || options[0];

  return (
    <Select
      options={options}
      value={selected}
      onChange={(opt) => onChange(opt?.value || '')}
      styles={darkStyles}
      isSearchable
      menuPlacement="auto"
      placeholder={placeholder}
    />
  );
}

export default CategorySelect;
