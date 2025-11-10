import { VercelRequest, VercelResponse } from "@vercel/node";
import { investmentsService } from "../lib/services/investments";
import { hasPluggyCredentials } from "../lib/pluggyClient";
import type { InvestmentRecord } from "../lib/types";
import axios from "axios";

const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = process.env;

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
    console.error("Error in investments handler:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { itemId, investmentId, transactions, fromDb } = req.query;

  if (investmentId && transactions === "true") {
    if (!hasPluggyCredentials()) {
      return res.status(500).json({
        error: "Missing Pluggy credentials in environment variables",
      });
    }

    try {
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

      const pageSize = req.query.pageSize
        ? parseInt(req.query.pageSize as string)
        : 20;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;

      const transactionsResponse = await axios.get(
        `https://api.pluggy.ai/investments/${investmentId}/transactions`,
        {
          params: { pageSize, page },
          headers: {
            "X-API-KEY": apiKey,
            Accept: "application/json",
          },
        }
      );

      return res.json(transactionsResponse.data);
    } catch (error) {
      console.error("Error fetching investment transactions from Pluggy:", error);
      return res.status(500).json({
        error: "Failed to fetch investment transactions from Pluggy",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  if (fromDb === "true") {
    if (!itemId || typeof itemId !== "string") {
      return res.status(400).json({ error: "itemId is required when fromDb=true" });
    }

    try {
      const investments = await investmentsService.getInvestmentsByItemId(itemId);
      return res.json(investments);
    } catch (error) {
      console.error("Error fetching investments from database:", error);
      return res.status(500).json({
        error: "Failed to fetch investments from database",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

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

      const params: any = { itemId };
      if (req.query.type && typeof req.query.type === "string") {
        params.type = req.query.type;
      }
      if (req.query.pageSize && typeof req.query.pageSize === "string") {
        params.pageSize = parseInt(req.query.pageSize);
      }
      if (req.query.page && typeof req.query.page === "string") {
        params.page = parseInt(req.query.page);
      }

      const investmentsResponse = await axios.get(
        "https://api.pluggy.ai/investments",
        {
          params,
          headers: {
            "X-API-KEY": apiKey,
            Accept: "application/json",
          },
        }
      );

      return res.json(investmentsResponse.data);
    } catch (error) {
      console.error("Error fetching investments from Pluggy:", error);
      return res.status(500).json({
        error: "Failed to fetch investments from Pluggy",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return res.status(400).json({
    error: "itemId parameter is required",
  });
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const { investments } = req.body as { investments: InvestmentRecord[] };

  if (!investments || !Array.isArray(investments)) {
    return res.status(400).json({ error: "investments array is required" });
  }

  for (const investment of investments) {
    if (!investment.investment_id || !investment.item_id || !investment.name) {
      return res.status(400).json({
        error:
          "Each investment must have investment_id, item_id, and name",
      });
    }
  }

  try {
    const savedInvestments =
      await investmentsService.createMultipleInvestments(investments);
    return res.status(201).json(savedInvestments);
  } catch (error) {
    console.error("Error saving investments:", error);
    return res.status(500).json({
      error: "Failed to save investments",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

