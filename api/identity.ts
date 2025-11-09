import { VercelRequest, VercelResponse } from "@vercel/node";
import { identityService } from "../lib/services/identity";
import type { IdentityRecord } from "../lib/types";
import axios from "axios";

const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = process.env;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    switch (req.method) {
      case "GET":
        return await handleGet(req, res);
      case "POST":
        return await handlePost(req, res);
      case "DELETE":
        return await handleDelete(req, res);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Error in identity handler:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { itemId } = req.query;

  if (!itemId || typeof itemId !== "string") {
    return res.status(400).json({ error: "itemId is required" });
  }

  const { source } = req.query;
  
  if (source === "pluggy") {
    if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
      return res.status(500).json({
        error: "Missing Pluggy credentials in environment variables",
      });
    }

    try {
      const authResponse = await axios.post("https://api.pluggy.ai/auth", {
        clientId: PLUGGY_CLIENT_ID,
        clientSecret: PLUGGY_CLIENT_SECRET,
      });
      const apiKey = authResponse.data.apiKey;

      const identityResponse = await axios.get(
        "https://api.pluggy.ai/identity",
        {
          params: { itemId },
          headers: {
            "X-API-KEY": apiKey,
            Accept: "application/json",
          },
        }
      );

      return res.json(identityResponse.data);
    } catch (error) {
      const axiosError = error as any;
      if (axiosError.response?.status === 404) {
        return res.status(404).json({
          error: "Identity not found for this item",
        });
      }
      throw error;
    }
  }

  const identity = await identityService.getIdentityByItemId(itemId);

  if (!identity) {
    return res.status(404).json({
      error: "Identity not found",
    });
  }

  return res.json(identity);
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const identityData = req.body as IdentityRecord;

  if (!identityData.item_id || !identityData.identity_id) {
    return res.status(400).json({
      error: "item_id and identity_id are required",
    });
  }

  try {
    const savedIdentity = await identityService.createIdentity(identityData);
    return res.status(201).json(savedIdentity);
  } catch (error) {
    console.error("Error saving identity:", error);
    return res.status(500).json({
      error: "Failed to save identity",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const { identityId } = req.query;

  if (!identityId || typeof identityId !== "string") {
    return res.status(400).json({ error: "identityId is required" });
  }

  try {
    await identityService.deleteIdentity(identityId);
    console.log(`Identity ${identityId} deleted from database`);

    return res.status(200).json({
      success: true,
      message: "Identity deleted successfully",
      identityId,
    });
  } catch (error) {
    console.error("Error deleting identity:", error);
    return res.status(500).json({
      error: "Failed to delete identity",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}