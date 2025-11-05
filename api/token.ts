import { VercelRequest, VercelResponse } from '@vercel/node'
import { PluggyClient } from 'pluggy-sdk'

const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = process.env

export default function (req: VercelRequest, res: VercelResponse) {
  // Add validation
  if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
    return res.status(500).json({ 
      error: 'Missing Pluggy credentials in environment variables' 
    });
  }

  const pluggyClient = new PluggyClient({
    clientId: PLUGGY_CLIENT_ID,
    clientSecret: PLUGGY_CLIENT_SECRET
  })

  const { itemId, options } = req.body || {}

  pluggyClient.createConnectToken(itemId, options).then((data) => res.json(data))
}