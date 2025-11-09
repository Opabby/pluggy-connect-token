import { PluggyClient } from 'pluggy-sdk';

const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = process.env;

const pluggyClient = new PluggyClient({
  clientId: PLUGGY_CLIENT_ID!,
  clientSecret: PLUGGY_CLIENT_SECRET!,
});

export function getPluggyClient(): PluggyClient {
  if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
    throw new Error('Missing Pluggy credentials in environment variables');
  }
  return pluggyClient;
}

export function hasPluggyCredentials(): boolean {
  return !!(PLUGGY_CLIENT_ID && PLUGGY_CLIENT_SECRET);
}