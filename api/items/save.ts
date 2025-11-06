import { VercelRequest, VercelResponse } from '@vercel/node';
import { itemsService } from '../../lib/services/items';
import type { PluggyItemRecord } from '../../lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const itemData: PluggyItemRecord = req.body;

    if (!itemData.item_id) {
      return res.status(400).json({ error: 'item_id is required' });
    }

    const savedItem = await itemsService.createItem(itemData);

    return res.status(201).json(savedItem);
  } catch (error) {
    console.error('Error saving item:', error);
    return res.status(500).json({ 
      error: 'Failed to save item',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}