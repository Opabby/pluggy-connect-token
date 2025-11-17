import { VercelRequest, VercelResponse } from "@vercel/node";
import { accountsService } from "../lib/services/accounts.service";
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
      // case "POST":
      //   return await handlePost(req, res);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Error in accounts handler:", error);

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
  const { itemId, accountId } = req.query;

  if (itemId && typeof itemId === "string") {
    if (!hasPluggyCredentials()) {
      return res.status(503).json({
        error: "Pluggy integration not configured",
        details: "Missing required credentials"
      });
    }

    try {
      const pluggyClient = getPluggyClient();
      const accountsResponse = await pluggyClient.fetchAccounts(itemId);
      
      return res.json({
        success: true,
        data: accountsResponse
      });
    } catch (error) {
      console.error("Error fetching accounts from Pluggy:", error);

      throw error;
    }
  }

  if (accountId && typeof accountId === "string") {
    const accounts = await accountsService.getAccountsByItemId(accountId);
    
    if (accounts.length === 0) {
      return res.status(404).json({ 
        error: "Account not found",
        details: `No account found with ID: ${accountId}`
      });
    }
    
    return res.json({
      success: true,
      data: accounts[0]
    });
  }

  return res.status(400).json({ 
    error: "Bad request",
    details: "Either itemId or accountId parameter is required" 
  });
}

// async function handlePost(req: VercelRequest, res: VercelResponse) {
//   const { accounts } = req.body as { accounts?: AccountRecord[] };

//   if (!accounts || !Array.isArray(accounts)) {
//     return res.status(400).json({ 
//       error: "Bad request",
//       details: "accounts array is required in request body" 
//     });
//   }

//   if (accounts.length === 0) {
//     return res.status(400).json({ 
//       error: "Bad request",
//       details: "accounts array cannot be empty" 
//     });
//   }

//   for (let i = 0; i < accounts.length; i++) {
//     const account = accounts[i];
//     if (!account.account_id || !account.item_id) {
//       return res.status(400).json({
//         error: "Bad request",
//         details: `Account at index ${i} is missing required fields (account_id or item_id)`,
//       });
//     }
//   }

//   try {
//     const savedAccounts = await accountsService.upsertMultipleAccounts(accounts);
    
//     return res.status(201).json({
//       success: true,
//       data: savedAccounts,
//       message: `Successfully saved ${savedAccounts.length} account(s)`
//     });
//   } catch (error) {
//     console.error("Error saving accounts:", error);
//     throw error;
//   }
// }