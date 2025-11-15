import { VercelRequest, VercelResponse } from "@vercel/node";
import { transactionsService } from "../lib/services/transactions";
import { getPluggyClient, hasPluggyCredentials } from "../lib/pluggyClient";

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
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Error in transactions handler:", error);
    
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
  const { accountId, from, to, fromDb, limit, offset, pageSize, page } = req.query;

  if (!accountId || typeof accountId !== "string") {
    return res.status(400).json({ 
      error: "Bad request",
      details: "accountId is required" 
    });
  }

  if (fromDb === "true") {
    const parsedLimit = limit && typeof limit === "string" ? parseInt(limit) : 100;
    const parsedOffset = offset && typeof offset === "string" ? parseInt(offset) : 0;

    try {
      const transactions = await transactionsService.getTransactionsByAccountId(
        accountId,
        parsedLimit,
        parsedOffset
      );

      return res.json({
        success: true,
        data: transactions
      });
    } catch (error) {
      console.error("Error fetching transactions from database:", error);
      throw error;
    }
  }

  if (!hasPluggyCredentials()) {
    return res.status(503).json({
      error: "Pluggy integration not configured",
      details: "Missing required credentials"
    });
  }

  if (from && typeof from !== "string") {
    return res.status(400).json({
      error: "Bad request",
      details: "from must be a date string (YYYY-MM-DD)",
    });
  }

  if (to && typeof to !== "string") {
    return res.status(400).json({
      error: "Bad request",
      details: "to must be a date string (YYYY-MM-DD)",
    });
  }

  try {
    const pluggyClient = getPluggyClient();

    const options: {
      from?: string;
      to?: string;
      pageSize?: number;
      page?: number;
    } = {};

    if (from && typeof from === "string") {
      options.from = from;
    }

    if (to && typeof to === "string") {
      options.to = to;
    }

    if (pageSize && typeof pageSize === "string") {
      options.pageSize = parseInt(pageSize);
    }

    if (page && typeof page === "string") {
      options.page = parseInt(page);
    }

    const transactionsResponse = await pluggyClient.fetchTransactions(
      accountId,
      options
    );

    return res.json({
      success: true,
      data: transactionsResponse
    });
  } catch (error) {
    console.error("Error fetching transactions from Pluggy:", error);
    throw error;
  }
}