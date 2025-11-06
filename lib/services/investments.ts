import { InvestmentRecord } from "../types";
import { supabase } from "../supabase";

export const investmentsService = {
  async createInvestment(investmentData: InvestmentRecord): Promise<InvestmentRecord> {
    const { data, error } = await supabase
      .from('investments')
      .insert([investmentData])
      .select()
      .single();

    if (error) {
      console.error('Error creating investment:', error);
      throw new Error(`Failed to create investment: ${error.message}`);
    }

    return data;
  },

  async getInvestmentsByItemId(itemId: string): Promise<InvestmentRecord[]> {
    const { data, error } = await supabase
      .from('investments')
      .select('*')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching investments:', error);
      throw new Error(`Failed to fetch investments: ${error.message}`);
    }

    return data || [];
  },

  async updateInvestment(investmentId: string, updateData: Partial<InvestmentRecord>): Promise<InvestmentRecord> {
    const { data, error } = await supabase
      .from('investments')
      .update(updateData)
      .eq('investment_id', investmentId)
      .select()
      .single();

    if (error) {
      console.error('Error updating investment:', error);
      throw new Error(`Failed to update investment: ${error.message}`);
    }

    return data;
  }
};