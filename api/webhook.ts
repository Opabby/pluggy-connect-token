import { VercelRequest, VercelResponse } from "@vercel/node";
import { processWebhookEvent } from "../lib/services/webhooks/webhook";
import type { WebhookPayload } from "../lib/types";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const payload = req.body as WebhookPayload;

    if (!payload.event || !payload.eventId) {
      return res.status(400).json({ 
        error: "Missing required fields: event and eventId are required" 
      });
    }

    try {
      await processWebhookEvent(payload);
    } catch (error) {
      console.error(`Error processing webhook event ${payload.event} (eventId: ${payload.eventId}):`, error);
      console.error("Error details:", error instanceof Error ? error.stack : error);
    }

    res.status(200).json({ 
      received: true,
      event: payload.event,
      eventId: payload.eventId,
    });
  } catch (error) {
    console.error("Error in webhook handler:", error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
    console.error("Error after response sent:", error);
  }
}

