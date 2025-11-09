import { IdentityRecord } from "../types";
import { supabase } from "../supabase";

export const identityService = {
  async upsertIdentity(identityData: IdentityRecord): Promise<IdentityRecord> {
    const { data, error } = await supabase
      .from("identitiess")
      .upsert(identityData, {
        onConflict: "identity_id",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error upserting identity:", error);
      throw new Error(`Failed to upsert identity: ${error.message}`);
    }

    return data;
  },

  async createIdentity(identityData: IdentityRecord): Promise<IdentityRecord> {
    const { data, error } = await supabase
      .from("identities")
      .insert([identityData])
      .select()
      .single();

    if (error) {
      console.error("Error creating identity:", error);
      throw new Error(`Failed to create identity: ${error.message}`);
    }

    return data;
  },

  async getIdentityByItemId(itemId: string): Promise<IdentityRecord | null> {
    const { data, error } = await supabase
      .from("identities")
      .select("*")
      .eq("item_id", itemId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      console.error("Error fetching identity:", error);
      throw new Error(`Failed to fetch identity: ${error.message}`);
    }

    return data;
  },

  async updateIdentity(
    identityId: string,
    updateData: Partial<IdentityRecord>
  ): Promise<IdentityRecord> {
    const { data, error } = await supabase
      .from("identities")
      .update(updateData)
      .eq("identity_id", identityId)
      .select()
      .single();

    if (error) {
      console.error("Error updating identity:", error);
      throw new Error(`Failed to update identity: ${error.message}`);
    }

    return data;
  },
};
