import { VercelRequest, VercelResponse } from '@vercel/node';
import { PluggyClient } from 'pluggy-sdk';

const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = process.env;

export default async function (req: VercelRequest, res: VercelResponse) {
  if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
    return res.status(500).json({ 
      error: 'Missing Pluggy credentials in environment variables' 
    });
  }

  const pluggyClient = new PluggyClient({
    clientId: PLUGGY_CLIENT_ID,
    clientSecret: PLUGGY_CLIENT_SECRET,
  });

  try {
    const { itemId, type } = req.query;
    
    if (!itemId || typeof itemId !== 'string') {
      return res.status(400).json({ error: 'itemId required' });
    }

    if (type && typeof type === 'string' && type !== 'BANK' && type !== 'CREDIT') {
      return res.status(400).json({ 
        error: 'Invalid type parameter. Must be either "BANK" or "CREDIT"' 
      });
    }

    const accountType = type && typeof type === 'string' ? (type as 'BANK' | 'CREDIT') : undefined;
    const accountsResponse = await pluggyClient.fetchAccounts(itemId, accountType);
    
    return res.json(accountsResponse);
  } catch (error) {
    console.error('Error fetching accounts from Pluggy:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch accounts',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}