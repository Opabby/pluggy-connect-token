import { CreditCardBillRecord } from "../types";
import { supabase } from "../supabase";

export const creditCardBillsService = {
  async upsertBill(
    billData: CreditCardBillRecord
  ): Promise<CreditCardBillRecord> {
    const { data, error } = await supabase
      .from("bills")
      .upsert(billData, {
        onConflict: "bill_id",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error upserting bill:", error);
      throw new Error(`Failed to upsert bill: ${error.message}`);
    }

    return data;
  },

  async createBill(
    billData: CreditCardBillRecord
  ): Promise<CreditCardBillRecord> {
    const { data, error } = await supabase
      .from("credit_card_bills")
      .insert([billData])
      .select()
      .single();

    if (error) {
      console.error("Error creating credit card bill:", error);
      throw new Error(`Failed to create credit card bill: ${error.message}`);
    }

    return data;
  },

  async createMultipleBills(
    bills: CreditCardBillRecord[]
  ): Promise<CreditCardBillRecord[]> {
    const { data, error } = await supabase
      .from("credit_card_bills")
      .insert(bills)
      .select();

    if (error) {
      console.error("Error creating credit card bills:", error);
      throw new Error(`Failed to create credit card bills: ${error.message}`);
    }

    return data || [];
  },

  async getBillsByAccountId(
    accountId: string
  ): Promise<CreditCardBillRecord[]> {
    const { data, error } = await supabase
      .from("credit_card_bills")
      .select("*")
      .eq("account_id", accountId)
      .order("due_date", { ascending: false });

    if (error) {
      console.error("Error fetching credit card bills:", error);
      throw new Error(`Failed to fetch credit card bills: ${error.message}`);
    }

    return data || [];
  },

  async updateBill(
    billId: string,
    updateData: Partial<CreditCardBillRecord>
  ): Promise<CreditCardBillRecord> {
    const { data, error } = await supabase
      .from("credit_card_bills")
      .update(updateData)
      .eq("bill_id", billId)
      .select()
      .single();

    if (error) {
      console.error("Error updating credit card bill:", error);
      throw new Error(`Failed to update credit card bill: ${error.message}`);
    }

    return data;
  },
};
