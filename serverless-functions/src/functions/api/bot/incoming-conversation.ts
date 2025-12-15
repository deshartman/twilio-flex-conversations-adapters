import { ServerlessFunctionSignature } from "@twilio-labs/serverless-runtime-types/types";
import {
  signRequest,
  getBotId,
  sendMessageToBot,
  readConversationAttributes
} from "./bot.helper.private";

// Import Twilio for Response object - using require for Twilio.Response compatibility
const Twilio = require('twilio');

// Define the context interface
interface BotContext {
  getTwilioClient: () => any;
  DOMAIN_NAME: string;
  ACCOUNT_SID: string;
  AUTH_TOKEN: string;
  [key: string]: any; // Index signature to satisfy EnvironmentVariables constraint
}

// Define the event interface
interface BotEvent {
  request: {
    cookies: Record<string, string>;
    headers: Record<string, string>;
  };
  Body?: string;
  ConversationSid: string;
  ChatServiceSid: string;
  Author: string;
  [key: string]: any; // Index signature for additional properties
}

/**
 * Handler for Bot onMessageAdded events
 */
export const handler: ServerlessFunctionSignature<BotContext, BotEvent> =
  async function (context, event, callback) {
    const assistantSid = await getBotId(context, event);

    const { ConversationSid, ChatServiceSid, Author } = event;
    const BotIdentity =
      typeof event.AssistantIdentity === "string"
        ? event.AssistantIdentity
        : undefined;

    let identity = Author.includes(":") ? Author : `user_id:${Author}`;

    const client = context.getTwilioClient();

    const webhooks = (
      await client.conversations.v1
        .services(ChatServiceSid)
        .conversations(ConversationSid)
        .webhooks.list()
    ).filter((entry: { target: string }) => entry.target === "studio");

    if (webhooks.length > 0) {
      // ignoring if the conversation has a studio webhook set (assuming it was handed over)
      return callback(null, "");
    }

    const participants = await client.conversations.v1
      .services(ChatServiceSid)
      .conversations(ConversationSid)
      .participants.list();

    if (participants.length > 1) {
      // Ignoring the conversation because there is more than one human
      return callback(null, "");
    }

    const token = await signRequest(context, event);
    const params = new URLSearchParams();
    params.append("_token", token);
    if (typeof BotIdentity === "string") {
      params.append("_assistantIdentity", BotIdentity);
    }
    const body = {
      body: event.Body,
      identity: identity,
      session_id: `conversations__${ChatServiceSid}/${ConversationSid}`,
      // using a callback to handle AI Assistant responding
      webhook: `https://${
        context.DOMAIN_NAME
      }/channels/conversations/response?${params.toString()}`,
    };

    const response = new Twilio.Response();
    response.appendHeader("content-type", "text/plain");
    response.setBody("");

    const attributes = await readConversationAttributes(
      context,
      ChatServiceSid,
      ConversationSid
    );
    await client.conversations.v1
      .services(ChatServiceSid)
      .conversations(ConversationSid)
      .update({
        attributes: JSON.stringify({ ...attributes, assistantIsTyping: true }),
      });

    try {
      await sendMessageToBot(context, assistantSid, body);
    } catch (err) {
      console.error(err);
    }

    callback(null, response);
  };
