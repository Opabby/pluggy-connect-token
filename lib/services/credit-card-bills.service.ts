import { CreditCardBillRecord } from "../types";
import { supabase } from "../supabase";

export const creditCardBillsService = {
  async upsertBill(
    billData: CreditCardBillRecord
  ): Promise<CreditCardBillRecord> {
    const { data, error } = await supabase
      .from("credit_card_bills")
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

  async upsertMultipleBills(
    bills: CreditCardBillRecord[]
  ): Promise<CreditCardBillRecord[]> {
    const { data, error } = await supabase
      .from("credit_card_bills")
      .upsert(bills, {
        onConflict: "bill_id",
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      console.error("Error upserting credit card bills:", error);
      throw new Error(`Failed to upsert credit card bills: ${error.message}`);
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
  }
};