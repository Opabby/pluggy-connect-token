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

    const identityResponse = await pluggyClient.fetchIdentityByItemId(itemId);

    return res.json(identityResponse);
  } catch (error) {
    console.error('Error fetching identity from Pluggy:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch identity',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}