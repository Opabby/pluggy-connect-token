import { VercelRequest, VercelResponse } from "@vercel/node";
import { transactionsService } from "../lib/services/transactions";
import { getPluggyClient, hasPluggyCredentials } from "../lib/pluggyClient";
import type { TransactionRecord } from "../lib/types";

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
      case "DELETE":
        return await handleDelete(req, res);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Error in transactions handler:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { accountId, from, to, fromDb, limit, offset } = req.query;

  if (!accountId || typeof accountId !== "string") {
    return res.status(400).json({ error: "accountId is required" });
  }

  // Get transactions from database
  if (fromDb === "true") {
    const parsedLimit =
      limit && typeof limit === "string" ? parseInt(limit) : 100;
    const parsedOffset =
      offset && typeof offset === "string" ? parseInt(offset) : 0;

    const transactions = await transactionsService.getTransactionsByAccountId(
      accountId,
      parsedLimit,
      parsedOffset
    );

    return res.json(transactions);
  }

  if (!hasPluggyCredentials()) {
    return res.status(500).json({
      error: "Missing Pluggy credentials in environment variables",
    });
  }

  const pluggyClient = getPluggyClient();

  if (from && typeof from !== "string") {
    return res.status(400).json({
      error: "from must be a date string (YYYY-MM-DD)",
    });
  }

  if (to && typeof to !== "string") {
    return res.status(400).json({
      error: "to must be a date string (YYYY-MM-DD)",
    });
  }

//   const transactionsResponse = await pluggyClient.fetchTransactions(
//     accountId,
//     from as string | undefined,
//     to as string | undefined
//   );

//   return res.json(transactionsResponse);
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const { transactions } = req.body as { transactions: TransactionRecord[] };

  if (!transactions || !Array.isArray(transactions)) {
    return res.status(400).json({ error: "transactions array is required" });
  }

  for (const transaction of transactions) {
    if (
      !transaction.transaction_id ||
      !transaction.account_id ||
      !transaction.date
    ) {
      return res.status(400).json({
        error:
          "Each transaction must have transaction_id, account_id, and date",
      });
    }
  }

  const savedTransactions = await transactionsService.createMultipleTransactions(
    transactions
  );

  return res.status(201).json(savedTransactions);
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const { transactionId } = req.query;

  if (!transactionId || typeof transactionId !== "string") {
    return res.status(400).json({ error: "transactionId is required" });
  }

  await transactionsService.deleteTransaction(transactionId);

  return res.status(200).json({
    success: true,
    message: "Transaction deleted successfully",
    transactionId,
  });
}