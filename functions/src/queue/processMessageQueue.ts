import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getWhatsAppProvider } from "../providers/whatsappProvider.js";
import type { Lead, MessageQueueItem } from "../types/domain.js";

function validPhone(phone: string) {
  return /^\+[1-9]\d{8,14}$/.test(phone);
}

async function blockedReason(item: MessageQueueItem, lead: Lead | null) {
  const db = getFirestore();
  if (!lead) return "Lead no encontrado.";
  if (!lead.tieneConsentimientoWhatsapp) return "Lead sin consentimiento WhatsApp.";
  if (lead.estado === "baja" || lead.estado === "bloqueado") return "Lead de baja o bloqueado.";
  if (!validPhone(item.phone)) return "Teléfono inválido.";
  const dnc = await db.collection("doNotContact").where("phone", "==", item.phone).limit(1).get();
  if (!dnc.empty) return "Contacto en lista de exclusión.";
  return null;
}

export const processMessageQueue = onSchedule("every 1 minutes", async () => {
  const db = getFirestore();
  const settingsSnap = await db.collection("settings").doc("global").get();
  const settings = settingsSnap.data();
  if (settings?.emergencyPaused) return;

  const provider = getWhatsAppProvider();
  const now = Timestamp.now();
  const pendingSnap = await db
    .collection("messageQueue")
    .where("status", "==", "pending")
    .where("scheduledAt", "<=", now)
    .orderBy("scheduledAt", "asc")
    .limit(Number(settings?.hourlyLimit ?? 20))
    .get();

  for (const doc of pendingSnap.docs) {
    const item = { id: doc.id, ...doc.data() } as MessageQueueItem;
    await doc.ref.update({ status: "processing" });
    const leadDoc = await db.collection("leads").doc(item.leadId).get();
    const lead = leadDoc.exists ? ({ id: leadDoc.id, ...leadDoc.data() } as Lead) : null;
    const reason = await blockedReason(item, lead);

    if (reason) {
      await doc.ref.update({ status: "cancelled", errorMessage: reason });
      continue;
    }

    const result =
      item.messageType === "media"
        ? await provider.sendMediaMessage({ to: item.phone, body: item.body, mediaUrl: item.mediaUrl })
        : item.messageType === "template"
          ? await provider.sendTemplateMessage({ to: item.phone, body: item.body, templateId: item.templateId })
          : await provider.sendTextMessage({ to: item.phone, body: item.body });

    await doc.ref.update({
      status: result.ok ? "sent" : "failed",
      sentAt: result.ok ? FieldValue.serverTimestamp() : null,
      providerMessageId: result.providerMessageId ?? null,
      errorMessage: result.errorMessage ?? null,
      retries: result.ok ? item.retries : item.retries + 1
    });

    await db.collection("messages").add({
      leadId: item.leadId,
      campaignId: item.campaignId ?? null,
      direction: "outbound",
      channel: "whatsapp",
      body: item.body,
      mediaUrl: item.mediaUrl ?? null,
      providerMessageId: result.providerMessageId ?? null,
      status: result.ok ? "sent" : "failed",
      createdAt: FieldValue.serverTimestamp()
    });
  }
});
