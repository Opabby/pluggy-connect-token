import { VercelRequest, VercelResponse } from "@vercel/node";
import { investmentsService } from "../lib/services/investments";
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
    console.error("Error in investments handler:", error);
    
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
  const { itemId, investmentId, transactions, fromDb, type } = req.query;

  if (investmentId && typeof investmentId === "string" && transactions === "true") {
    if (!hasPluggyCredentials()) {
      return res.status(503).json({
        error: "Pluggy integration not configured",
        details: "Missing required credentials"
      });
    }

    try {
      const pluggyClient = getPluggyClient();
      
      const pageSize = req.query.pageSize
        ? parseInt(req.query.pageSize as string)
        : 20;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;

      const transactionsResponse = await pluggyClient.fetchInvestmentTransactions(
        investmentId,
        {
          pageSize,
          page,
        }
      );

      return res.json({
        success: true,
        data: transactionsResponse
      });
    } catch (error) {
      console.error("Error fetching investment transactions from Pluggy:", error);
      throw error;
    }
  }

  if (fromDb === "true") {
    if (!itemId || typeof itemId !== "string") {
      return res.status(400).json({ 
        error: "Bad request",
        details: "itemId is required when fromDb=true" 
      });
    }

    try {
      const investments = await investmentsService.getInvestmentsByItemId(itemId);
      return res.json({
        success: true,
        data: investments
      });
    } catch (error) {
      console.error("Error fetching investments from database:", error);
      throw error;
    }
  }

  if (itemId && typeof itemId === "string") {
    if (!hasPluggyCredentials()) {
      return res.status(503).json({
        error: "Pluggy integration not configured",
        details: "Missing required credentials"
      });
    }

    try {
      const pluggyClient = getPluggyClient();

      const pageSize = req.query.pageSize
        ? parseInt(req.query.pageSize as string)
        : 20;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;

      const validTypes = ["MUTUAL_FUND", "SECURITY", "EQUITY", "COE", "FIXED_INCOME", "ETF", "OTHER"] as const;
      type InvestmentType = typeof validTypes[number];
      
      let investmentType: InvestmentType | undefined = undefined;
      if (type && typeof type === "string") {
        const upperType = type.toUpperCase();
        if (validTypes.includes(upperType as InvestmentType)) {
          investmentType = upperType as InvestmentType;
        }
      }

      const investmentsResponse = await pluggyClient.fetchInvestments(
        itemId,
        investmentType,
        {
          pageSize,
          page,
        }
      );

      return res.json({
        success: true,
        data: investmentsResponse
      });
    } catch (error) {
      console.error("Error fetching investments from Pluggy:", error);
      throw error;
    }
  }

  return res.status(400).json({
    error: "Bad request",
    details: "itemId parameter is required",
  });
}