import { AccountRecord } from "../types";
import { supabase } from "../supabase";

export const accountsService = {
  async upsertAccount(accountData: AccountRecord): Promise<AccountRecord> {
    const { data, error } = await supabase
      .from("accounts")
      .upsert(accountData, {
        onConflict: "account_id",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error upserting account:", error);
      throw new Error(`Failed to upsert account: ${error.message}`);
    }

    return data;
  },

  async createAccount(accountData: AccountRecord): Promise<AccountRecord> {
    const { data, error } = await supabase
      .from("accounts")
      .insert([accountData])
      .select()
      .single();

    if (error) {
      console.error("Error creating account:", error);
      throw new Error(`Failed to create account: ${error.message}`);
    }

    return data;
  },

  async createMultipleAccounts(
    accounts: AccountRecord[]
  ): Promise<AccountRecord[]> {
    const { data, error } = await supabase
      .from("accounts")
      .insert(accounts)
      .select();

    if (error) {
      console.error("Error creating accounts:", error);
      throw new Error(`Failed to create accounts: ${error.message}`);
    }

    return data || [];
  },

  async getAccountsByItemId(itemId: string): Promise<AccountRecord[]> {
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching accounts:", error);
      throw new Error(`Failed to fetch accounts: ${error.message}`);
    }

    return data || [];
  },

  async updateAccount(
    accountId: string,
    updateData: Partial<AccountRecord>
  ): Promise<AccountRecord> {
    const { data, error } = await supabase
      .from("accounts")
      .update(updateData)
      .eq("account_id", accountId)
      .select()
      .single();

    if (error) {
      console.error("Error updating account:", error);
      throw new Error(`Failed to update account: ${error.message}`);
    }

    return data;
  },

  async deleteAccount(accountId: string): Promise<void> {
    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("account_id", accountId);

    if (error) {
      console.error("Error deleting account:", error);
      throw new Error(`Failed to delete account: ${error.message}`);
    }
  },
};
