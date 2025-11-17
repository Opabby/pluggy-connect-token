import { TransactionRecord } from "../types";
import { supabase } from "../supabase";

export const transactionsService = {
  async upsertTransaction(
    transactionData: TransactionRecord
  ): Promise<TransactionRecord> {
    const { data, error } = await supabase
      .from("transactions")
      .upsert(transactionData, {
        onConflict: "transaction_id",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error upserting transaction:", error);
      throw new Error(`Failed to upsert transaction: ${error.message}`);
    }

    return data;
  },

  async upsertMultipleTransactions(
    transactions: TransactionRecord[]
  ): Promise<TransactionRecord[]> {
    const { data, error } = await supabase
      .from("transactions")
      .upsert(transactions, {
        onConflict: "transaction_id",
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      console.error("Error upserting transactions:", error);
      throw new Error(`Failed to upsert transactions: ${error.message}`);
    }

    return data || [];
  },

  async getTransactionsByAccountId(
    accountId: string,
    limit = 100,
    offset = 0
  ): Promise<TransactionRecord[]> {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("account_id", accountId)
      .order("date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching transactions:", error);
      throw new Error(`Failed to fetch transactions: ${error.message}`);
    }

    return data || [];
  },

  async deleteMultipleTransactions(transactionIds: string[]): Promise<void> {
    const { error } = await supabase
      .from("transactions")
      .delete()
      .in("transaction_id", transactionIds);

    if (error) {
      console.error("Error deleting transactions:", error);
      throw new Error(`Failed to delete transactions: ${error.message}`);
    }
  },
};
