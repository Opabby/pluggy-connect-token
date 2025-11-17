import { getPluggyClient, hasPluggyCredentials } from "../../pluggyClient";
import { ItemWebhookPayload } from "../../types";
import { itemsService } from "../items.service";
import { syncItemData } from "../sync.service";
import { mapItemFromPluggyToDb } from "../mappers/item.mapper";

export async function handleItemEvent(payload: ItemWebhookPayload): Promise<void> {
  if (!hasPluggyCredentials()) {
    console.error("Missing Pluggy credentials, cannot fetch item data");
    return;
  }

  const itemId = payload.itemId || payload.id;
  if (!itemId) {
    console.error("Missing itemId in webhook payload");
    return;
  }

  const { event } = payload;

  try {
    const pluggy = getPluggyClient();
    const item = await pluggy.fetchItem(itemId);
    const itemRecord = mapItemFromPluggyToDb(item);

    try {
      await itemsService.upsertItem(itemRecord);
    } catch (upsertError) {
      console.error(`Failed to upsert item ${itemId}:`, upsertError);
      throw upsertError;
    }

    if (event === "item/created" || event === "item/updated" || event === "item/login_succeeded") {
      try {
        await syncItemData(itemId);
      } catch (syncError) {
        console.error(`Error syncing data for item ${itemId}:`, syncError);
        console.error("Sync error details:", syncError instanceof Error ? syncError.stack : syncError);
      }
    }
  } catch (error) {
    console.error(`Error handling item event for ${itemId}:`, error);
    throw error;
  }
}

export async function handleItemDeleted(payload: ItemWebhookPayload): Promise<void> {
  const itemId = payload.itemId || payload.id;
  if (!itemId) {
    console.error("Missing itemId in webhook payload");
    return;
  }

  try {
    await itemsService.deleteItem(itemId);
  } catch (error) {
    console.error(`Error deleting item ${itemId}:`, error);
    if (error instanceof Error && !error.message.includes("PGRST116")) {
      throw error;
    }
  }
}

export async function handleItemStatusEvent(payload: ItemWebhookPayload): Promise<void> {
  const itemId = payload.itemId || payload.id;
  if (!itemId) {
    console.error("Missing itemId in webhook payload");
    return;
  }

  try {
    if (!hasPluggyCredentials()) {
      console.error("Missing Pluggy credentials, cannot fetch item data");
      return;
    }

    const pluggy = getPluggyClient();
    const item = await pluggy.fetchItem(itemId);
    const itemRecord = mapItemFromPluggyToDb(item);

    await itemsService.upsertItem(itemRecord);
  } catch (error) {
    console.error(`Error handling item status event for ${itemId}:`, error);
    throw error;
  }
}