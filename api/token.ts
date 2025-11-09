import { VercelRequest, VercelResponse } from '@vercel/node'
import { getPluggyClient, hasPluggyCredentials } from '../lib/pluggyClient';

const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = process.env

export default function (req: VercelRequest, res: VercelResponse) {
  if (!hasPluggyCredentials()) {
    return res.status(500).json({ 
      error: 'Missing Pluggy credentials in environment variables' 
    });
  }

  const pluggyClient = getPluggyClient();

  const { itemId, options } = req.body || {}

  pluggyClient.createConnectToken(itemId, options).then((data) => res.json(data))
}