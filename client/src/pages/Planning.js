import React from 'react';

/*
  Planning can include several sub-views like:
  - "Mortgage" (eg amortization table - can be attached to an added account if the user can add
    their mortgage account or values can be manually specified)
  - "Retirement" (basic retirement growth calculation & graph - again, amounts can either be
    manually added or attached to plaid-linked accounts)
  - "Emergency Fund" (choosing different categories from the categories list that would or would
    not be included if the user had to live entirely off of an emergency fund and therefore how
    large of a fund the user should have based on X months of this. Also, linking to plaid-linked
    account(s) that might track an existing emergency fund)
*/

function Planning() {
  return (
    <div>
      <h4>Planning</h4>
    </div>
  );
}

export default Planning;
