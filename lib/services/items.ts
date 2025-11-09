import { PluggyItemRecord } from "../types";
import { supabase } from "../supabase";

export const itemsService = {
  async upsertItem(itemData: PluggyItemRecord): Promise<PluggyItemRecord> {
    const { data, error } = await supabase
      .from("items")
      .upsert(itemData, {
        onConflict: "item_id",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error upserting item:", error);
      throw new Error(`Failed to upsert item: ${error.message}`);
    }

    return data;
  },

  async createItem(itemData: PluggyItemRecord): Promise<PluggyItemRecord> {
    const { data, error } = await supabase
      .from("pluggy_items")
      .insert([itemData])
      .select()
      .single();

    if (error) {
      console.error("Error creating item:", error);
      throw new Error(`Failed to create item: ${error.message}`);
    }

    return data;
  },

  async getUserItems(userId?: string): Promise<PluggyItemRecord[]> {
    let query = supabase.from("pluggy_items").select("*");

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.order("updated_at", {
      ascending: false,
    });

    if (error) {
      console.error("Error fetching items:", error);
      throw new Error(`Failed to fetch items: ${error.message}`);
    }

    return data || [];
  },

  async getItemById(itemId: string): Promise<PluggyItemRecord | null> {
    const { data, error } = await supabase
      .from("pluggy_items")
      .select("*")
      .eq("item_id", itemId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      console.error("Error fetching item:", error);
      throw new Error(`Failed to fetch item: ${error.message}`);
    }

    return data;
  },

  async updateItem(
    itemId: string,
    updateData: Partial<PluggyItemRecord>
  ): Promise<PluggyItemRecord> {
    const { data, error } = await supabase
      .from("pluggy_items")
      .update(updateData)
      .eq("item_id", itemId)
      .select()
      .single();

    if (error) {
      console.error("Error updating item:", error);
      throw new Error(`Failed to update item: ${error.message}`);
    }

    return data;
  },

  async deleteItem(itemId: string): Promise<void> {
    const { error } = await supabase
      .from("pluggy_items")
      .delete()
      .eq("item_id", itemId);

    if (error) {
      console.error("Error deleting item:", error);
      throw new Error(`Failed to delete item: ${error.message}`);
    }
  },
};
