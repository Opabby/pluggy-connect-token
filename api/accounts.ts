import { VercelRequest, VercelResponse } from "@vercel/node";
import { accountsService } from "../lib/services/accounts";
import { getPluggyClient, hasPluggyCredentials } from "../lib/pluggyClient";
import type { AccountRecord } from "../lib/types";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    switch (req.method) {
      case "GET":
        return await handleGet(req, res);
      case "POST":
        return await handlePost(req, res);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Error in accounts handler:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { itemId, accountId } = req.query;

  if (itemId && typeof itemId === "string") {
    if (!hasPluggyCredentials()) {
      return res.status(500).json({
        error: "Missing Pluggy credentials in environment variables",
      });
    }

    const pluggyClient = getPluggyClient();
    const accountsResponse = await pluggyClient.fetchAccounts(itemId);
    return res.json(accountsResponse);
  }

  if (accountId && typeof accountId === "string") {
    const accounts = await accountsService.getAccountsByItemId(accountId);
    if (accounts.length === 0) {
      return res.status(404).json({ error: "Account not found" });
    }
    return res.json(accounts[0]);
  }

  return res.status(400).json({ 
    error: "itemId or accountId parameter is required" 
  });
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const { accounts } = req.body as { accounts: AccountRecord[] };

  if (!accounts || !Array.isArray(accounts)) {
    return res.status(400).json({ error: "accounts array is required" });
  }

  for (const account of accounts) {
    if (!account.account_id || !account.item_id) {
      return res.status(400).json({
        error: "Each account must have account_id and item_id",
      });
    }
  }

  const savedAccounts = await accountsService.upsertMultipleAccounts(accounts);
  return res.status(201).json(savedAccounts);
}
