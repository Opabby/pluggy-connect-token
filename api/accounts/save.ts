import { VercelRequest, VercelResponse } from '@vercel/node';
import { accountsService } from '../../lib/services/accounts';
import type { AccountRecord } from '../../lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accounts } = req.body as { accounts: AccountRecord[] };

    if (!accounts || !Array.isArray(accounts)) {
      return res.status(400).json({ error: 'accounts array is required' });
    }

    const savedAccounts = await accountsService.createMultipleAccounts(accounts);

    return res.status(201).json(savedAccounts);
  } catch (error) {
    console.error('Error saving accounts:', error);
    return res.status(500).json({ 
      error: 'Failed to save accounts',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}