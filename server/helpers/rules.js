function matchRule(rules, merchantName) {
  if (!merchantName) 
    return null;

  for (const rule of rules) {
    try {
      const regex = new RegExp(rule.pattern, 'i');
      if (regex.test(merchantName)) {
        return rule;
      }
    }
    catch (e) {
      // Skip invalid regex
    }
  }

  return null;
}

module.exports = { matchRule };
