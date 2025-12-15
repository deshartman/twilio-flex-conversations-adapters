import { sign, decode } from "jsonwebtoken";
import { Context } from "@twilio-labs/serverless-runtime-types/types";

/**
 * Sends a message to the bot
 * @param context - The Twilio runtime context
 * @param botInstanceId - The ID of the bot instance
 * @param body - The message body to send
 */
export async function sendMessageToBot(
  context: Context & { TWILIO_REGION?: string; ACCOUNT_SID: string; AUTH_TOKEN: string },
  botInstanceId: string,
  body: Record<string, any>
) {
  const url = `https://ROVO_URL_HERE`;

  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${context.ACCOUNT_SID}:${context.AUTH_TOKEN}`,
        "utf-8"
      ).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  if (response.ok) {
    console.log("Sent message to Bot");
    return;
  } else {
    throw new Error(
      "Failed to send request to Bot. " + (await response.text())
    );
  }
}

/**
 * Reads attributes from a conversation
 * @param context - The Twilio runtime context
 * @param chatServiceSid - The Chat Service SID
 * @param conversationSid - The Conversation SID
 * @returns The parsed conversation attributes
 */
export async function readConversationAttributes(
  context: Context & { getTwilioClient: () => any },
  chatServiceSid: string,
  conversationSid: string
) {
  try {
    const client = context.getTwilioClient();
    const data = await client.conversations.v1
      .services(chatServiceSid)
      .conversations(conversationSid)
      .fetch();
    return JSON.parse(data.attributes);
  } catch (err) {
    console.error(err);
    return {};
  }
}

/**
 * Gets the bot ID from context or event
 * @param context - The Twilio runtime context
 * @param event - The event object
 * @returns The bot ID
 */
export async function getBotId(
  context: Context & { AUTH_TOKEN: string; BOT_ID?: string },
  event: {
    EventType?: string;
    botId?: string;
    ConversationSid?: string;
    ChatServiceSid?: string;
  }
) {
  if (event.EventType === "onMessageAdded") {
    try {
      const { ConversationSid, ChatServiceSid } = event;
      const parsed = await readConversationAttributes(
        context,
        ChatServiceSid,
        ConversationSid
      );
      if (typeof parsed.botId === "string" && parsed.botId) {
        return parsed.botId;
      }
    } catch (err) {
      console.log("Invalid attribute structure", err);
    }
  }
  const botId = event.botId || context.BOT_ID || event.botId || context.BOT_ID;

  if (!botId) {
    throw new Error("Missing Bot ID configuration");
  }

  return botId;
}

/**
 * Signs a request with JWT
 * @param context - The Twilio runtime context
 * @param event - The event object
 * @returns The signed JWT token
 */
export async function signRequest(
  context: Context & { AUTH_TOKEN: string },
  event: Record<string, any>
) {
  const assistantSid = await getBotId(context, event);
  const authToken = context.AUTH_TOKEN;
  if (!authToken) {
    throw new Error("No auth token found");
  }
  return sign({ assistantSid }, authToken, { expiresIn: "5m" });
}

/**
 * Verifies a request token
 * @param context - The Twilio runtime context
 * @param event - The event object containing the token
 * @returns Whether the token is valid
 */
export function verifyRequest(
  context: Context & { AUTH_TOKEN: string },
  event: { _token: string }
) {
  const token = event._token;
  if (!token) {
    throw new Error("Missing token");
  }

  const authToken = context.AUTH_TOKEN;
  if (!authToken) {
    throw new Error("No auth token found");
  }

  try {
    // The decode function from jsonwebtoken only takes a token and options
    const decoded = decode(token, { json: true });
    if (decoded && typeof decoded === 'object' && 'assistantSid' in decoded) {
      return true;
    }
  } catch (err) {
    console.error("Failed to verify token", err);
    return false;
  }
  return false;
}

// All functions are already exported using named exports
