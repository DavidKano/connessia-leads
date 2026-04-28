export interface SendParams {
  to: string;
  body?: string;
  templateId?: string;
  mediaUrl?: string;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}

export interface IncomingMessage {
  from: string;
  body: string;
  providerMessageId?: string;
  receivedAt: string;
}

export interface WhatsAppProvider {
  sendTemplateMessage(params: SendParams): Promise<SendResult>;
  sendTextMessage(params: SendParams): Promise<SendResult>;
  sendMediaMessage(params: SendParams): Promise<SendResult>;
  verifyWebhook(payload: unknown, headers?: Headers): boolean;
  parseIncomingMessage(payload: unknown): IncomingMessage | null;
}

export class MockWhatsAppProvider implements WhatsAppProvider {
  async sendTemplateMessage(params: SendParams): Promise<SendResult> {
    return {
      ok: true,
      providerMessageId: `mock_tpl_${Date.now()}_${params.to.replace(/\D/g, "")}`
    };
  }

  async sendTextMessage(params: SendParams): Promise<SendResult> {
    return {
      ok: true,
      providerMessageId: `mock_txt_${Date.now()}_${params.to.replace(/\D/g, "")}`
    };
  }

  async sendMediaMessage(params: SendParams): Promise<SendResult> {
    return {
      ok: Boolean(params.mediaUrl),
      providerMessageId: params.mediaUrl
        ? `mock_media_${Date.now()}_${params.to.replace(/\D/g, "")}`
        : undefined,
      errorMessage: params.mediaUrl ? undefined : "Falta mediaUrl para envío multimedia."
    };
  }

  verifyWebhook() {
    return true;
  }

  parseIncomingMessage(payload: unknown): IncomingMessage | null {
    if (!payload || typeof payload !== "object") return null;
    const record = payload as Record<string, unknown>;
    const from = String(record.from ?? "");
    const body = String(record.body ?? "");
    if (!from || !body) return null;

    return {
      from,
      body,
      providerMessageId: String(record.providerMessageId ?? `mock_in_${Date.now()}`),
      receivedAt: new Date().toISOString()
    };
  }
}

export function getWhatsAppProvider(): WhatsAppProvider {
  return new MockWhatsAppProvider();
}
