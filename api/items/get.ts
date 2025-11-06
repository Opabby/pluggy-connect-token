import { VercelRequest, VercelResponse } from '@vercel/node';
import { itemsService } from '../../lib/services/items';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, itemId } = req.query;

    if (itemId && typeof itemId === 'string') {
      const item = await itemsService.getItemById(itemId);
      
      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }
      
      return res.json(item);
    }

    const items = await itemsService.getUserItems(
      userId && typeof userId === 'string' ? userId : undefined
    );

    return res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch items',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}