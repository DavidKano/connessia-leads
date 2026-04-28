import { onRequest } from "firebase-functions/v2/https";
import { handleIncomingWhatsAppMessage } from "../engine/campaignEngine.js";
import { getWhatsAppProvider } from "../providers/whatsappProvider.js";

export const whatsappWebhook = onRequest(async (req, res) => {
  const provider = getWhatsAppProvider();

  if (req.method === "GET") {
    const ok = provider.verifyWebhook({
      query: req.query as Record<string, string | string[] | undefined>,
      headers: req.headers,
      body: req.body,
      rawBody: req.rawBody
    });
    if (!ok) {
      res.status(403).send("Forbidden");
      return;
    }
    res.status(200).send(req.query["hub.challenge"] ?? "ok");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const requestLike = {
    query: req.query as Record<string, string | string[] | undefined>,
    headers: req.headers,
    body: req.body,
    rawBody: req.rawBody
  };

  if (!provider.verifyWebhook(requestLike)) {
    res.status(403).send("Invalid webhook signature or token");
    return;
  }

  const incoming = provider.parseIncomingMessage(requestLike);
  if (!incoming) {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  const result = await handleIncomingWhatsAppMessage(incoming);
  res.status(200).json({ ok: true, result });
});
