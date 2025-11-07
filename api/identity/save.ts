import { VercelRequest, VercelResponse } from '@vercel/node';
import { identityService } from '../../lib/services/identity';
import type { IdentityRecord } from '../../lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { identity } = req.body as { identity: IdentityRecord };

    if (!identity) {
      return res.status(400).json({ error: 'identity object is required' });
    }

    if (!identity.identity_id || !identity.item_id) {
      return res.status(400).json({ 
        error: 'Identity must have identity_id and item_id' 
      });
    }

    const savedIdentity = await identityService.createIdentity(identity);

    return res.status(201).json(savedIdentity);
  } catch (error) {
    console.error('Error saving identity:', error);
    return res.status(500).json({ 
      error: 'Failed to save identity',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}