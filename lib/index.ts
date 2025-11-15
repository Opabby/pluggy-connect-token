import { itemsService } from "./services/items";
import { accountsService } from "./services/accounts";
import { transactionsService } from "./services/transactions";
import { creditCardBillsService } from "./services/credit-card-bills";
import { investmentsService } from "./services/investments";
import { loansService } from "./services/loans";
import { identityService } from "./services/identity";

export default {
  items: itemsService,
  accounts: accountsService,
  transactions: transactionsService,
  creditCardBills: creditCardBillsService,
  investments: investmentsService,
  loans: loansService,
  identity: identityService,
};