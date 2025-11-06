import { VercelRequest, VercelResponse } from '@vercel/node';
import { transactionsService } from '../../lib/services/transactions';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accountId, limit, offset } = req.query;

    if (!accountId || typeof accountId !== 'string') {
      return res.status(400).json({ error: 'accountId is required' });
    }

    const parsedLimit = limit && typeof limit === 'string' ? parseInt(limit) : 100;
    const parsedOffset = offset && typeof offset === 'string' ? parseInt(offset) : 0;

    const transactions = await transactionsService.getTransactionsByAccountId(
      accountId,
      parsedLimit,
      parsedOffset
    );

    return res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch transactions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}