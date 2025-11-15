import { PluggyClient } from 'pluggy-sdk';

let pluggyClientInstance: PluggyClient;

export function getPluggyClient(): PluggyClient {
  const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = process.env;

  if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
    throw new Error(
      'Missing Pluggy credentials. Please set PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET environment variables.'
    );
  }

  if (pluggyClientInstance) {
    return pluggyClientInstance;
  }

  pluggyClientInstance = new PluggyClient({
    clientId: PLUGGY_CLIENT_ID,
    clientSecret: PLUGGY_CLIENT_SECRET,
  });

  return pluggyClientInstance;
}

export function hasPluggyCredentials(): boolean {
  const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = process.env;
  return !!(PLUGGY_CLIENT_ID && PLUGGY_CLIENT_SECRET);
}
