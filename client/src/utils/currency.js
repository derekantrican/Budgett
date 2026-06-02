let currencySettings = {
  currency_symbol: '$',
  number_format: '1,000.00',
};

export function setCurrencySettings(settings) {
  if (settings.currency_symbol != null) currencySettings.currency_symbol = settings.currency_symbol;
  if (settings.number_format != null) currencySettings.number_format = settings.number_format;
}

export function formatCurrency(amount) {
  const { currency_symbol, number_format } = currencySettings;
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount).toFixed(2);
  const [whole, dec] = abs.split('.');

  let formatted;
  switch (number_format) {
    case '1000.00':
      formatted = `${whole}.${dec}`;
      break;
    case '1.000,00':
      formatted = `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
      break;
    case '1000,00':
      formatted = `${whole},${dec}`;
      break;
    case '1,000.00':
    default:
      formatted = `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
      break;
  }

  return `${sign}${currency_symbol}${formatted}`;
}
