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

    // Process critical parts synchronously (item upsert) to ensure data is saved
    // Then respond quickly to Pluggy, and do heavy syncing asynchronously
    try {
      // Process the webhook event - critical parts first
      await processWebhookEvent(payload);
      console.log(`Successfully processed webhook event: ${payload.event} (eventId: ${payload.eventId})`);
    } catch (error) {
      // Log error but still respond with success to avoid retries
      // The error will be visible in logs for debugging
      console.error(`Error processing webhook event ${payload.event} (eventId: ${payload.eventId}):`, error);
      console.error("Error details:", error instanceof Error ? error.stack : error);
    }

    // IMPORTANT: Respond with 2XX status after processing
    // This ensures the processing completes before Vercel terminates the function
    // For most events, processing should complete within 5 seconds
    res.status(200).json({ 
      received: true,
      event: payload.event,
      eventId: payload.eventId,
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

