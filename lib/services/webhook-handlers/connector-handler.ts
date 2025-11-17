import { ConnectorStatusWebhookPayload } from "../../types";

export async function handleConnectorStatusUpdate(payload: ConnectorStatusWebhookPayload): Promise<void> {
  const { connectorId, data } = payload;
  console.log(`Connector ${connectorId} status updated:`, data);
}