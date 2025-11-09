import { VercelRequest, VercelResponse } from "@vercel/node";
import { itemsService } from "../../lib/services/items";
import { accountsService } from "../../lib/services/accounts";
import { identityService } from "../../lib/services/identity";
import { getPluggyClient, hasPluggyCredentials } from "../../lib/pluggyClient";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { itemId } = req.query;

    if (!itemId || typeof itemId !== "string") {
      return res.status(400).json({ error: "itemId is required" });
    }

    const warnings: string[] = [];

    if (hasPluggyCredentials()) {
      try {
        const pluggyClient = getPluggyClient();
        await pluggyClient.deleteItem(itemId);
        console.log(`Item ${itemId} deleted from Pluggy`);
      } catch (pluggyError: any) {
        console.error("Error deleting item from Pluggy:", pluggyError);

        if (pluggyError.response?.status === 404) {
          warnings.push(
            "Item not found in Pluggy (already deleted or never existed), proceeding with database cleanup"
          );
        } else {
          warnings.push(
            `Failed to delete from Pluggy: ${pluggyError.message}, but proceeding with database cleanup`
          );
        }
      }
    } else {
      warnings.push(
        "Pluggy credentials not configured, skipping Pluggy API deletion"
      );
    }

    try {
      const identity = await identityService.getIdentityByItemId(itemId);
      if (identity) {
        await identityService.deleteIdentity(identity.identity_id);
        console.log(`Identity deleted for item ${itemId}`);
      }
    } catch (identityError) {
      console.error("Error deleting identity:", identityError);
      warnings.push("Failed to delete identity from database");
    }

    try {
      const accounts = await accountsService.getAccountsByItemId(itemId);
      if (accounts && accounts.length > 0) {
        for (const account of accounts) {
          await accountsService.deleteAccount(account.account_id);
        }
        console.log(`${accounts.length} account(s) deleted for item ${itemId}`);
      }
    } catch (accountsError) {
      console.error("Error deleting accounts:", accountsError);
      warnings.push("Failed to delete accounts from database");
    }

    try {
      await itemsService.deleteItem(itemId);
      console.log(`Item ${itemId} deleted from database`);
    } catch (itemError) {
      console.error("Error deleting item from database:", itemError);
      return res.status(500).json({
        error: "Failed to delete item from database",
        details:
          itemError instanceof Error ? itemError.message : "Unknown error",
      });
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({
      success: true,
      message: "Item and related data deleted successfully",
      itemId,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    console.error("Error in delete item handler:", error);
    return res.status(500).json({
      error: "Failed to delete item",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
