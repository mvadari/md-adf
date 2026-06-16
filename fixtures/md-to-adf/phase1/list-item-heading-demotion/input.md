1. Construct a transaction:
   tx = LoanSet(flags={"tf_loan_over_payment": True})
   # Result: tx.flags = 0
   # No exception raised
