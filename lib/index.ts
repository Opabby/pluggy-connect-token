import { itemsService } from "./services/items.service";
import { accountsService } from "./services/accounts.service";
import { transactionsService } from "./services/transactions.service";
import { creditCardBillsService } from "./services/credit-card-bills.service";
import { investmentsService } from "./services/investments.service";
import { loansService } from "./services/loans.service";
import { identityService } from "./services/identity.service";

export default {
  items: itemsService,
  accounts: accountsService,
  transactions: transactionsService,
  creditCardBills: creditCardBillsService,
  investments: investmentsService,
  loans: loansService,
  identity: identityService,
};