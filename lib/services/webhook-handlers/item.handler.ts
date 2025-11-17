import { getPluggyClient, hasPluggyCredentials } from "../../pluggyClient";
import { ItemWebhookPayload, PluggyItemRecord } from "../../types";
import { itemsService } from "../items.service";
import { syncItemData } from "../sync.service";

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

    const itemData = item as any;
    const connector = itemData.connector || {};
    
    const itemRecord: PluggyItemRecord = {
      item_id: itemData.id,
      user_id: itemData.userId || payload.clientUserId || undefined,
      connector_id: connector.id ? connector.id.toString() : itemData.connectorId?.toString(),
      connector_name: connector.name || itemData.connectorName,
      connector_image_url: connector.imageUrl || connector.image_url || itemData.connectorImageUrl,
      status: itemData.status,
      created_at: itemData.createdAt,
      updated_at: itemData.updatedAt,
      last_updated_at: itemData.lastUpdatedAt,
      webhook_url: itemData.webhookUrl || itemData.webhook_url,
      parameters: itemData.parameters,
      institution_name: connector.name || itemData.connectorName || itemData.institutionName,
      institution_url: connector.url || connector.website || itemData.institutionUrl,
      primary_color: connector.primaryColor || connector.primary_color || itemData.primaryColor,
      secondary_color: connector.secondaryColor || connector.secondary_color || itemData.secondaryColor,
    };

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

    const itemData = item as any;
    const connector = itemData.connector || {};
    
    const itemRecord: PluggyItemRecord = {
      item_id: itemData.id,
      user_id: itemData.userId || payload.clientUserId || undefined,
      connector_id: connector.id ? connector.id.toString() : itemData.connectorId?.toString(),
      connector_name: connector.name || itemData.connectorName,
      connector_image_url: connector.imageUrl || connector.image_url || itemData.connectorImageUrl,
      status: itemData.status,
      created_at: itemData.createdAt,
      updated_at: itemData.updatedAt,
      last_updated_at: itemData.lastUpdatedAt,
      webhook_url: itemData.webhookUrl || itemData.webhook_url,
      parameters: itemData.parameters,
      institution_name: connector.name || itemData.connectorName || itemData.institutionName,
      institution_url: connector.url || connector.website || itemData.institutionUrl,
      primary_color: connector.primaryColor || connector.primary_color || itemData.primaryColor,
      secondary_color: connector.secondaryColor || connector.secondary_color || itemData.secondaryColor,
    };

    await itemsService.upsertItem(itemRecord);
  } catch (error) {
    console.error(`Error handling item status event for ${itemId}:`, error);
    throw error;
  }
}