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
    const { itemId } = req.query;
    
    if (!itemId || typeof itemId !== 'string') {
      return res.status(400).json({ error: 'itemId required' });
    }
    
    const accounts = await pluggyClient.fetchAccounts(itemId);
    return res.json(accounts);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return res.status(500).json({ error: 'Failed to fetch accounts' });
  }
}