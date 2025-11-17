import { getPluggyClient, hasPluggyCredentials } from "../../pluggyClient";
import { TransactionsWebhookPayload } from "../../types";
import { upsertTransactionRecord } from "./utils";

export async function handleTransactionsCreated(payload: TransactionsWebhookPayload): Promise<void> {
  const { itemId, accountId, transactionIds } = payload;
  
  if (!hasPluggyCredentials()) {
    console.error("Missing Pluggy credentials, cannot fetch transactions");
    return;
  }

  const pluggy = getPluggyClient();

  try {
    if (accountId) {
      const allTransactions = await pluggy.fetchAllTransactions(accountId);
      
      const transactionsToProcess = transactionIds && transactionIds.length > 0
        ? allTransactions.filter((t: any) => transactionIds.includes(t.id))
        : allTransactions;
      
      if (transactionsToProcess.length > 0) {
        for (const transaction of transactionsToProcess) {
          await upsertTransactionRecord(transaction as any, accountId);
        }
      }
    } else if (itemId) {
      const { results: accounts } = await pluggy.fetchAccounts(itemId);
      
      for (const account of accounts) {
        try {
          const allTransactions = await pluggy.fetchAllTransactions(account.id);
          
          const transactionsToProcess = transactionIds && transactionIds.length > 0
            ? allTransactions.filter((t: any) => transactionIds.includes(t.id))
            : allTransactions;
          
          if (transactionsToProcess.length > 0) {
            for (const transaction of transactionsToProcess) {
              await upsertTransactionRecord(transaction as any, account.id);
            }
          }
        } catch (error) {
          console.error(`Error fetching transactions for account ${account.id}:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`Error handling transactions created event:`, error);
    throw error;
  }
}