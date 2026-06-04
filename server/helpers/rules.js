function matchRule(rules, merchantName, amount) {
  if (!merchantName) 
    return null;

  for (const rule of rules) {
    try {
      const regex = new RegExp(rule.pattern, 'i');
      if (!regex.test(merchantName)) 
        continue;

      // If rule has an amount condition, evaluate it
      if (rule.amount_condition) {
        if (!evaluateAmountCondition(rule.amount_condition, amount)) 
          continue;
      }

      return rule;
    }
    catch (e) {
      // Skip invalid regex or condition
    }
  }

  return null;
}

function evaluateAmountCondition(condition, amount) {
  // Only allow safe characters: digits, operators, parens, spaces, 'amount'
  const safe = /^[amount\d\s\.\+\-\*\/\%\(\)<>=!&|]+$/;
  if (!safe.test(condition)) 
    return false;

  try {
    const fn = new Function('amount', `return (${condition});`);
    return !!fn(amount);
  }
  catch (e) {
    return false;
  }
}

module.exports = { matchRule, evaluateAmountCondition };
