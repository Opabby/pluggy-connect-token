import { LoanRecord } from "../types";
import { supabase } from "../supabase";

export const loansService = {
  async upsertLoans(loanData: LoanRecord): Promise<LoanRecord> {
    const { data, error } = await supabase
      .from("loans")
      .upsert(loanData, {
        onConflict: "loan_id",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error upserting loan:", error);
      throw new Error(`Failed to upsert loan: ${error.message}`);
    }

    return data;
  },

  async createLoan(loanData: LoanRecord): Promise<LoanRecord> {
    const { data, error } = await supabase
      .from("loans")
      .insert([loanData])
      .select()
      .single();

    if (error) {
      console.error("Error creating loan:", error);
      throw new Error(`Failed to create loan: ${error.message}`);
    }

    return data;
  },

  async createMultipleLoans(loans: LoanRecord[]): Promise<LoanRecord[]> {
    const { data, error } = await supabase
      .from("loans")
      .insert(loans)
      .select();

    if (error) {
      console.error("Error creating loans:", error);
      throw new Error(`Failed to create loans: ${error.message}`);
    }

    return data || [];
  },

  async getLoansByItemId(itemId: string): Promise<LoanRecord[]> {
    const { data, error } = await supabase
      .from("loans")
      .select("*")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching loans:", error);
      throw new Error(`Failed to fetch loans: ${error.message}`);
    }

    return data || [];
  },

  async updateLoan(
    loanId: string,
    updateData: Partial<LoanRecord>
  ): Promise<LoanRecord> {
    const { data, error } = await supabase
      .from("loans")
      .update(updateData)
      .eq("loan_id", loanId)
      .select()
      .single();

    if (error) {
      console.error("Error updating loan:", error);
      throw new Error(`Failed to update loan: ${error.message}`);
    }

    return data;
  },
};
