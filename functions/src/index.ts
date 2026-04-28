import { initializeApp } from "firebase-admin/app";
import { whatsappWebhook } from "./webhooks/whatsappWebhook.js";
import { processMessageQueue } from "./queue/processMessageQueue.js";

initializeApp();

export { whatsappWebhook, processMessageQueue };
