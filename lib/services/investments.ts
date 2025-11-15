import { InvestmentRecord, InvestmentTransactionRecord } from "../types";
import { supabase } from "../supabase";

export const investmentsService = {
  async upsertInvestment(
    investmentData: InvestmentRecord
  ): Promise<InvestmentRecord> {
    const { data, error } = await supabase
      .from("investments")
      .upsert(investmentData, {
        onConflict: "investment_id",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error upserting investment:", error);
      throw new Error(`Failed to upsert investment: ${error.message}`);
    }

    return data;
  },

  async upsertMultipleInvestments(
    investments: InvestmentRecord[]
  ): Promise<InvestmentRecord[]> {
    const { data, error } = await supabase
      .from("investments")
      .upsert(investments, {
        onConflict: "investment_id",
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      console.error("Error upserting investments:", error);
      throw new Error(`Failed to upsert investments: ${error.message}`);
    }

    return data || [];
  },

  async upsertMultipleInvestmentTransactions(
    transactions: InvestmentTransactionRecord[]
  ): Promise<InvestmentTransactionRecord[]> {
    const { data, error } = await supabase
      .from("investment_transactions")
      .upsert(transactions, {
        onConflict: "transaction_id",
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      console.error("Error upserting investment transactions:", error);
      throw new Error(`Failed to upsert investment transactions: ${error.message}`);
    }

    return data || [];
  },

  async getInvestmentsByItemId(itemId: string): Promise<InvestmentRecord[]> {
    const { data, error } = await supabase
      .from("investments")
      .select("*")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching investments:", error);
      throw new Error(`Failed to fetch investments: ${error.message}`);
    }

    return data || [];
  }
};