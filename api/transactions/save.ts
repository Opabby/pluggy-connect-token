import { VercelRequest, VercelResponse } from '@vercel/node';
import { transactionsService } from '../../lib/services/transactions';
import type { TransactionRecord } from '../../lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { transactions } = req.body as { transactions: TransactionRecord[] };

    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ error: 'transactions array is required' });
    }

    const savedTransactions = await transactionsService.createMultipleTransactions(transactions);

    return res.status(201).json(savedTransactions);
  } catch (error) {
    console.error('Error saving transactions:', error);
    return res.status(500).json({ 
      error: 'Failed to save transactions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}