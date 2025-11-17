import { VercelRequest, VercelResponse } from "@vercel/node";
import { identityService } from "../lib/services/identity.service";
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
    console.error("Error in identity handler:", error);
    
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
              error: "Identity not found" 
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
  const { itemId, source } = req.query;

  if (!itemId || typeof itemId !== "string") {
    return res.status(400).json({ 
      error: "Bad request",
      details: "itemId is required" 
    });
  }

  if (source === "pluggy") {
    if (!hasPluggyCredentials()) {
      return res.status(503).json({
        error: "Pluggy integration not configured",
        details: "Missing required credentials"
      });
    }

    try {
      const pluggyClient = getPluggyClient();

      const identityResponse = await pluggyClient.fetchIdentityByItemId(itemId);
      
      return res.json({
        success: true,
        data: identityResponse
      });
    } catch (error) {
      console.error("Error fetching identity from Pluggy:", error);

      if (error instanceof Error && 'response' in error) {
        const response = error.response as { status?: number };
        if (response.status === 404) {
          return res.status(404).json({
            error: "Identity not found",
            details: "Identity not found for this item in Pluggy"
          });
        }
      }
      
      throw error;
    }
  }

  try {
    const identity = await identityService.getIdentityByItemId(itemId);

    if (!identity) {
      return res.status(404).json({
        error: "Identity not found",
        details: "Identity not found in database"
      });
    }

    return res.json({
      success: true,
      data: identity
    });
  } catch (error) {
    console.error("Error fetching identity from database:", error);
    throw error;
  }
}
