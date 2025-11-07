import { VercelRequest, VercelResponse } from '@vercel/node';
import { identityService } from '../../lib/services/identity';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { itemId } = req.query;

    if (!itemId || typeof itemId !== 'string') {
      return res.status(400).json({ error: 'itemId is required' });
    }

    const identity = await identityService.getIdentityByItemId(itemId);

    if (!identity) {
      return res.status(404).json({ error: 'Identity not found for this item' });
    }

    return res.json(identity);
  } catch (error) {
    console.error('Error fetching identity:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch identity',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}