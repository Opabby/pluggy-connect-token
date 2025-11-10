import { InvestmentRecord, InvestmentTransactionRecord } from "../types";
import { supabase } from "../supabase";

export const investmentsService = {
  async upsertInvestiment(
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

  async createInvestment(
    investmentData: InvestmentRecord
  ): Promise<InvestmentRecord> {
    const { data, error } = await supabase
      .from("investments")
      .insert([investmentData])
      .select()
      .single();

    if (error) {
      console.error("Error creating investment:", error);
      throw new Error(`Failed to create investment: ${error.message}`);
    }

    return data;
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
  },

  async createMultipleInvestments(
    investments: InvestmentRecord[]
  ): Promise<InvestmentRecord[]> {
    const { data, error } = await supabase
      .from("investments")
      .insert(investments)
      .select();

    if (error) {
      console.error("Error creating investments:", error);
      throw new Error(`Failed to create investments: ${error.message}`);
    }

    return data || [];
  },

  async updateInvestment(
    investmentId: string,
    updateData: Partial<InvestmentRecord>
  ): Promise<InvestmentRecord> {
    const { data, error } = await supabase
      .from("investments")
      .update(updateData)
      .eq("investment_id", investmentId)
      .select()
      .single();

    if (error) {
      console.error("Error updating investment:", error);
      throw new Error(`Failed to update investment: ${error.message}`);
    }

    return data;
  },

  // Investment Transactions methods
  async createInvestmentTransaction(
    transactionData: InvestmentTransactionRecord
  ): Promise<InvestmentTransactionRecord> {
    const { data, error } = await supabase
      .from("investment_transactions")
      .insert([transactionData])
      .select()
      .single();

    if (error) {
      console.error("Error creating investment transaction:", error);
      throw new Error(`Failed to create investment transaction: ${error.message}`);
    }

    return data;
  },

  async createMultipleInvestmentTransactions(
    transactions: InvestmentTransactionRecord[]
  ): Promise<InvestmentTransactionRecord[]> {
    const { data, error } = await supabase
      .from("investment_transactions")
      .insert(transactions)
      .select();

    if (error) {
      console.error("Error creating investment transactions:", error);
      throw new Error(`Failed to create investment transactions: ${error.message}`);
    }

    return data || [];
  },

  async getInvestmentTransactionsByInvestmentId(
    investmentId: string,
    limit = 100,
    offset = 0
  ): Promise<InvestmentTransactionRecord[]> {
    const { data, error } = await supabase
      .from("investment_transactions")
      .select("*")
      .eq("investment_id", investmentId)
      .order("date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching investment transactions:", error);
      throw new Error(`Failed to fetch investment transactions: ${error.message}`);
    }

    return data || [];
  },
};
