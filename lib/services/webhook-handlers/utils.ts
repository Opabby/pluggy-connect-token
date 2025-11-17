import { TransactionRecord } from "../../types";
import { transactionsService } from "../transactions.service";

export async function upsertTransactionRecord(transaction: any, accountId: string): Promise<void> {
  const transactionDate = transaction.date 
    ? (typeof transaction.date === 'string' 
        ? transaction.date 
        : new Date(transaction.date).toISOString().split('T')[0])
    : new Date().toISOString().split('T')[0];
  
  const transactionRecord: TransactionRecord = {
    transaction_id: transaction.id,
    account_id: accountId,
    date: transactionDate,
    description: transaction.description || "",
    description_raw: transaction.descriptionRaw,
    amount: transaction.amount,
    amount_in_account_currency: transaction.amountInAccountCurrency,
    balance: transaction.balance,
    currency_code: transaction.currencyCode,
    category: transaction.category,
    category_id: transaction.categoryId,
    provider_code: transaction.providerCode,
    provider_id: transaction.providerId,
    status: transaction.status,
    type: transaction.type,
    operation_type: transaction.operationType,
    operation_category: transaction.operationCategory,
    payment_data: transaction.paymentData,
    credit_card_metadata: transaction.creditCardMetadata,
    merchant: transaction.merchant,
  };

  await transactionsService.upsertTransaction(transactionRecord);
}