import { VercelRequest, VercelResponse } from "@vercel/node";
import { creditCardBillsService } from "../lib/services/credit-card-bills";
import { hasPluggyCredentials } from "../lib/pluggyClient";
import type { CreditCardBillRecord } from "../lib/types";
import axios from "axios";

const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = process.env;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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
    console.error("Error in bills handler:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { accountId, fromDb } = req.query;

  // Get bills from database
  if (fromDb === "true") {
    if (!accountId || typeof accountId !== "string") {
      return res.status(400).json({ error: "accountId is required when fromDb=true" });
    }

    try {
      const bills = await creditCardBillsService.getBillsByAccountId(accountId);
      return res.json(bills);
    } catch (error) {
      console.error("Error fetching bills from database:", error);
      return res.status(500).json({
        error: "Failed to fetch bills from database",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Get bills from Pluggy API
  if (accountId && typeof accountId === "string") {
    if (!hasPluggyCredentials()) {
      return res.status(500).json({
        error: "Missing Pluggy credentials in environment variables",
      });
    }

    try {
      // Get API key
      let apiKey: string | null = null;
      try {
        const authResponse = await axios.post("https://api.pluggy.ai/auth", {
          clientId: PLUGGY_CLIENT_ID,
          clientSecret: PLUGGY_CLIENT_SECRET,
        });
        apiKey = authResponse.data.apiKey;
      } catch (authError) {
        console.error("Error getting Pluggy API key:", authError);
        return res.status(500).json({
          error: "Failed to authenticate with Pluggy API",
        });
      }

      const billsResponse = await axios.get("https://api.pluggy.ai/bills", {
        params: { accountId },
        headers: {
          "X-API-KEY": apiKey,
          Accept: "application/json",
        },
      });

      return res.json(billsResponse.data);
    } catch (error) {
      console.error("Error fetching bills from Pluggy:", error);
      return res.status(500).json({
        error: "Failed to fetch bills from Pluggy",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return res.status(400).json({
    error: "accountId parameter is required",
  });
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const { bills } = req.body as { bills: CreditCardBillRecord[] };

  if (!bills || !Array.isArray(bills)) {
    return res.status(400).json({ error: "bills array is required" });
  }

  for (const bill of bills) {
    if (!bill.bill_id || !bill.account_id || !bill.due_date || bill.total_amount === undefined) {
      return res.status(400).json({
        error: "Each bill must have bill_id, account_id, due_date, and total_amount",
      });
    }
  }

  try {
    const savedBills = await creditCardBillsService.upsertMultipleBills(bills);
    return res.status(201).json(savedBills);
  } catch (error) {
    console.error("Error saving bills:", error);
    return res.status(500).json({
      error: "Failed to save bills",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

