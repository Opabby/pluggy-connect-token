import { itemsService } from "./items";

export const utilityService = {
  async syncItemData(itemId: string, pluggyItemData: any): Promise<void> {
    try {
      await itemsService.updateItem(itemId, {
        status: pluggyItemData.status,
        last_updated_at: new Date().toISOString()
      });

      console.log(`✅ Item ${itemId} synced successfully`);
    } catch (error) {
      console.error(`❌ Error syncing item ${itemId}:`, error);
      throw error;
    }
  },

  async deleteItemAndRelatedData(itemId: string): Promise<void> {
    try {
      await itemsService.deleteItem(itemId);
      
      console.log(`✅ Item ${itemId} and all related data deleted successfully`);
    } catch (error) {
      console.error(`❌ Error deleting item ${itemId}:`, error);
      throw error;
    }
  }
};