import { VercelRequest, VercelResponse } from "@vercel/node";
import { loansService } from "../lib/services/loans";
import { hasPluggyCredentials } from "../lib/pluggyClient";
import type { LoanRecord } from "../lib/types";
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
    console.error("Error in loans handler:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { itemId, fromDb } = req.query;

  // Get loans from database
  if (fromDb === "true") {
    if (!itemId || typeof itemId !== "string") {
      return res.status(400).json({ error: "itemId is required when fromDb=true" });
    }

    try {
      const loans = await loansService.getLoansByItemId(itemId);
      return res.json(loans);
    } catch (error) {
      console.error("Error fetching loans from database:", error);
      return res.status(500).json({
        error: "Failed to fetch loans from database",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Get loans from Pluggy API
  if (itemId && typeof itemId === "string") {
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

      const loansResponse = await axios.get("https://api.pluggy.ai/loans", {
        params: { itemId },
        headers: {
          "X-API-KEY": apiKey,
          Accept: "application/json",
        },
      });

      return res.json(loansResponse.data);
    } catch (error) {
      console.error("Error fetching loans from Pluggy:", error);
      return res.status(500).json({
        error: "Failed to fetch loans from Pluggy",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return res.status(400).json({
    error: "itemId parameter is required",
  });
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const { loans } = req.body as { loans: LoanRecord[] };

  if (!loans || !Array.isArray(loans)) {
    return res.status(400).json({ error: "loans array is required" });
  }

  for (const loan of loans) {
    if (!loan.loan_id || !loan.item_id || !loan.product_name) {
      return res.status(400).json({
        error: "Each loan must have loan_id, item_id, and product_name",
      });
    }
  }

  try {
    const savedLoans = await loansService.createMultipleLoans(loans);
    return res.status(201).json(savedLoans);
  } catch (error) {
    console.error("Error saving loans:", error);
    return res.status(500).json({
      error: "Failed to save loans",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

