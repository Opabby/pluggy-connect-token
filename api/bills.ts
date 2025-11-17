import { VercelRequest, VercelResponse } from "@vercel/node";
import { creditCardBillsService } from "../lib/services/credit-card-bills.service";
import { getPluggyClient, hasPluggyCredentials } from "../lib/pluggyClient";
import type { CreditCardBillRecord } from "../lib/types";

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
    
    if (error instanceof Error) {
      if ('response' in error && typeof error.response === 'object') {
        const response = error.response as { status?: number };
        
        switch (response.status) {
          case 401:
            return res.status(401).json({ 
              error: "Authentication failed. Please check Pluggy credentials." 
            });
          case 404:
            return res.status(404).json({ 
              error: "Resource not found" 
            });
          case 429:
            return res.status(429).json({ 
              error: "Rate limit exceeded. Please try again later." 
            });
          default:
            break;
        }
      }
      
      return res.status(500).json({
        error: "Internal server error",
        details: error.message,
      });
    }
    
    return res.status(500).json({
      error: "Internal server error",
      details: "Unknown error",
    });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { accountId, fromDb } = req.query;

  if (fromDb === "true") {
    if (!accountId || typeof accountId !== "string") {
      return res.status(400).json({ 
        error: "Bad request",
        details: "accountId is required when fromDb=true" 
      });
    }

    try {
      const bills = await creditCardBillsService.getBillsByAccountId(accountId);
      return res.json({
        success: true,
        data: bills
      });
    } catch (error) {
      console.error("Error fetching bills from database:", error);
      throw error;
    }
  }

  if (accountId && typeof accountId === "string") {
    if (!hasPluggyCredentials()) {
      return res.status(503).json({
        error: "Pluggy integration not configured",
        details: "Missing required credentials"
      });
    }

    try {
      const pluggyClient = getPluggyClient();

      const billsResponse = await pluggyClient.fetchCreditCardBills(accountId);
      
      return res.json({
        success: true,
        data: billsResponse
      });
    } catch (error) {
      console.error("Error fetching bills from Pluggy:", error);
      throw error;
    }
  }

  return res.status(400).json({
    error: "Bad request",
    details: "accountId parameter is required",
  });
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const { bills } = req.body as { bills?: CreditCardBillRecord[] };

  if (!bills || !Array.isArray(bills)) {
    return res.status(400).json({ 
      error: "Bad request",
      details: "bills array is required in request body" 
    });
  }

  if (bills.length === 0) {
    return res.status(400).json({ 
      error: "Bad request",
      details: "bills array cannot be empty" 
    });
  }

  for (let i = 0; i < bills.length; i++) {
    const bill = bills[i];
    if (!bill.bill_id || !bill.account_id || !bill.due_date || bill.total_amount === undefined) {
      return res.status(400).json({
        error: "Bad request",
        details: `Bill at index ${i} is missing required fields (bill_id, account_id, due_date, or total_amount)`,
      });
    }
  }

  try {
    const savedBills = await creditCardBillsService.upsertMultipleBills(bills);
    return res.status(201).json({
      success: true,
      data: savedBills,
      message: `Successfully saved ${savedBills.length} bill(s)`
    });
  } catch (error) {
    console.error("Error saving bills:", error);
    throw error;
  }
}