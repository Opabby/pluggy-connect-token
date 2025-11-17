import { LoanRecord } from "../types";
import { supabase } from "../supabase";

export const loansService = {
  async upsertLoan(loanData: LoanRecord): Promise<LoanRecord> {
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

  async upsertMultipleLoans(loans: LoanRecord[]): Promise<LoanRecord[]> {
    const { data, error } = await supabase
      .from("loans")
      .upsert(loans, {
        onConflict: "loan_id",
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      console.error("Error upserting loans:", error);
      throw new Error(`Failed to upsert loans: ${error.message}`);
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
  }
};