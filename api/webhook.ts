import { VercelRequest, VercelResponse } from "@vercel/node";
import { processWebhookEvent } from "../lib/services/webhook";
import type { WebhookPayload } from "../lib/types";

/**
 * Webhook handler for Pluggy webhook events
 * 
 * This handler:
 * 1. Accepts POST requests from Pluggy
 * 2. Validates the webhook payload
 * 3. Responds with 2XX within 5 seconds (as required by Pluggy)
 * 4. Processes webhook events asynchronously after responding
 * 
 * Important: The handler must respond quickly (< 5 seconds) to avoid retries.
 * All processing is done asynchronously after the response is sent.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    // Validate request body
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const payload = req.body as WebhookPayload;

    // Validate required fields
    if (!payload.event || !payload.eventId) {
      return res.status(400).json({ 
        error: "Missing required fields: event and eventId are required" 
      });
    }

    // Log the webhook event
    console.log(`Received webhook event: ${payload.event} (eventId: ${payload.eventId})`);

    // IMPORTANT: Respond immediately with 2XX status
    // This must happen within 5 seconds to avoid retries
    res.status(200).json({ 
      received: true,
      event: payload.event,
      eventId: payload.eventId,
    });

    // Process the webhook event asynchronously AFTER responding
    // This allows processing to take longer than 5 seconds without triggering retries
    setImmediate(async () => {
      try {
        await processWebhookEvent(payload);
        console.log(`Successfully processed webhook event: ${payload.event} (eventId: ${payload.eventId})`);
      } catch (error) {
        // Log error but don't throw - we've already responded with success
        console.error(`Error processing webhook event ${payload.event} (eventId: ${payload.eventId}):`, error);
        // In a production environment, you might want to:
        // - Send error to monitoring service (e.g., Sentry)
        // - Queue for retry processing
        // - Store in dead letter queue
      }
    });
  } catch (error) {
    console.error("Error in webhook handler:", error);
    // If we haven't responded yet, send error response
    if (!res.headersSent) {
      return res.status(500).json({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
    // If we've already responded, just log the error
    console.error("Error after response sent:", error);
  }
}

