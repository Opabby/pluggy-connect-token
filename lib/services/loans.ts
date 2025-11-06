import { LoanRecord } from "../types";
import { supabase } from "../supabase";

export const loansService = {
  async createLoan(loanData: LoanRecord): Promise<LoanRecord> {
    const { data, error } = await supabase
      .from('loans')
      .insert([loanData])
      .select()
      .single();

    if (error) {
      console.error('Error creating loan:', error);
      throw new Error(`Failed to create loan: ${error.message}`);
    }

    return data;
  },

  async getLoansByItemId(itemId: string): Promise<LoanRecord[]> {
    const { data, error } = await supabase
      .from('loans')
      .select('*')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching loans:', error);
      throw new Error(`Failed to fetch loans: ${error.message}`);
    }

    return data || [];
  },

  async updateLoan(loanId: string, updateData: Partial<LoanRecord>): Promise<LoanRecord> {
    const { data, error } = await supabase
      .from('loans')
      .update(updateData)
      .eq('loan_id', loanId)
      .select()
      .single();

    if (error) {
      console.error('Error updating loan:', error);
      throw new Error(`Failed to update loan: ${error.message}`);
    }

    return data;
  }
};