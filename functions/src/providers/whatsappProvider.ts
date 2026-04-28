import crypto from "node:crypto";
import type { IncomingMessage, ProviderName, SendResult } from "../types/domain.js";

export interface SendParams {
  to: string;
  body?: string;
  templateId?: string;
  mediaUrl?: string;
}

export interface WebhookRequestLike {
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  rawBody?: Buffer;
}

export interface WhatsAppProvider {
  sendTemplateMessage(params: SendParams): Promise<SendResult>;
  sendTextMessage(params: SendParams): Promise<SendResult>;
  sendMediaMessage(params: SendParams): Promise<SendResult>;
  verifyWebhook(req: WebhookRequestLike): boolean;
  parseIncomingMessage(req: WebhookRequestLike): IncomingMessage | null;
}

export class MockWhatsAppProvider implements WhatsAppProvider {
  async sendTemplateMessage(params: SendParams): Promise<SendResult> {
    return { ok: true, providerMessageId: `mock_tpl_${Date.now()}_${params.to}` };
  }

  async sendTextMessage(params: SendParams): Promise<SendResult> {
    return { ok: true, providerMessageId: `mock_txt_${Date.now()}_${params.to}` };
  }

  async sendMediaMessage(params: SendParams): Promise<SendResult> {
    return params.mediaUrl
      ? { ok: true, providerMessageId: `mock_media_${Date.now()}_${params.to}` }
      : { ok: false, errorMessage: "mediaUrl requerido" };
  }

  verifyWebhook(req: WebhookRequestLike): boolean {
    const token = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    return !token || req.headers["x-connessia-token"] === token || req.query["hub.verify_token"] === token;
  }

  parseIncomingMessage(req: WebhookRequestLike): IncomingMessage | null {
    const body = req.body as Record<string, unknown>;
    const from = String(body.from ?? "");
    const text = String(body.body ?? body.text ?? "");
    if (!from || !text) return null;
    return {
      from,
      body: text,
      providerMessageId: String(body.providerMessageId ?? `mock_in_${Date.now()}`),
      receivedAt: new Date().toISOString()
    };
  }
}

export class MetaCloudWhatsAppProvider extends MockWhatsAppProvider {
  override verifyWebhook(req: WebhookRequestLike): boolean {
    const mode = req.query["hub.mode"];
    const verifyToken = req.query["hub.verify_token"];
    const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (mode === "subscribe" && verifyToken === expected) return true;

    const signature = req.headers["x-hub-signature-256"];
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!signature || !appSecret || !req.rawBody) return false;
    const expectedSignature = `sha256=${crypto.createHmac("sha256", appSecret).update(req.rawBody).digest("hex")}`;
    return crypto.timingSafeEqual(Buffer.from(String(signature)), Buffer.from(expectedSignature));
  }

  override parseIncomingMessage(req: WebhookRequestLike): IncomingMessage | null {
    const body = req.body as {
      entry?: Array<{ changes?: Array<{ value?: { messages?: Array<{ from: string; id?: string; text?: { body?: string } }> } }> }>;
    };
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message?.from || !message.text?.body) return null;
    return {
      from: message.from.startsWith("+") ? message.from : `+${message.from}`,
      body: message.text.body,
      providerMessageId: message.id,
      receivedAt: new Date().toISOString()
    };
  }

  override async sendTemplateMessage(): Promise<SendResult> {
    return { ok: false, errorMessage: "TODO: conectar endpoint oficial de Meta Cloud API con plantilla aprobada." };
  }

  override async sendTextMessage(): Promise<SendResult> {
    return { ok: false, errorMessage: "TODO: enviar mensaje de sesión por Meta Cloud API." };
  }

  override async sendMediaMessage(): Promise<SendResult> {
    return { ok: false, errorMessage: "TODO: subir/enviar media por Meta Cloud API." };
  }
}

export class SpokiWhatsAppProvider extends MockWhatsAppProvider {
  override async sendTemplateMessage(): Promise<SendResult> {
    return { ok: false, errorMessage: "TODO: implementar llamada a Spoki API usando SPOKI_API_KEY." };
  }
}

export class TwilioWhatsAppProvider extends MockWhatsAppProvider {
  override async sendTemplateMessage(): Promise<SendResult> {
    return { ok: false, errorMessage: "TODO: implementar Twilio WhatsApp API con TWILIO_ACCOUNT_SID/AUTH_TOKEN." };
  }
}

export class Dialog360WhatsAppProvider extends MockWhatsAppProvider {
  override async sendTemplateMessage(): Promise<SendResult> {
    return { ok: false, errorMessage: "TODO: implementar 360dialog API con API key oficial." };
  }
}

export function getWhatsAppProvider(): WhatsAppProvider {
  const provider = (process.env.WHATSAPP_PROVIDER ?? "mock") as ProviderName;
  if (provider === "meta_cloud") return new MetaCloudWhatsAppProvider();
  if (provider === "spoki") return new SpokiWhatsAppProvider();
  if (provider === "twilio") return new TwilioWhatsAppProvider();
  if (provider === "360dialog") return new Dialog360WhatsAppProvider();
  return new MockWhatsAppProvider();
}
