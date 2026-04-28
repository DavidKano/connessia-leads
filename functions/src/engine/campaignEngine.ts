import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { IncomingMessage, Lead } from "../types/domain.js";

function classifyReply(text: string): "positive" | "negative" | "unsubscribe" | "ambiguous" {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

  if (/\b(baja|stop|no quiero|eliminar|no me contactes|no me contacteis)\b/.test(normalized)) return "unsubscribe";
  if (/^(no|no gracias|nop|negativo)\b/.test(normalized)) return "negative";
  if (/\b(si|me interesa|info|vale|ok|adelante|claro|demo)\b/.test(normalized)) return "positive";
  return "ambiguous";
}

export async function handleIncomingWhatsAppMessage(message: IncomingMessage) {
  const db = getFirestore();
  const leadSnap = await db.collection("leads").where("telefono", "in", [message.from, `+${message.from.replace(/^\+/, "")}`]).limit(1).get();
  if (leadSnap.empty) {
    await db.collection("auditLogs").add({
      userId: "system",
      action: "incoming_message_without_lead",
      entityType: "message",
      entityId: message.providerMessageId ?? "unknown",
      details: message,
      createdAt: FieldValue.serverTimestamp()
    });
    return { status: "ignored", reason: "lead_not_found" };
  }

  const leadDoc = leadSnap.docs[0];
  const lead = { id: leadDoc.id, ...leadDoc.data() } as Lead;
  const replyKind = classifyReply(message.body);

  await db.collection("messages").add({
    leadId: lead.id,
    direction: "inbound",
    channel: "whatsapp",
    body: message.body,
    providerMessageId: message.providerMessageId,
    status: "received",
    createdAt: FieldValue.serverTimestamp()
  });

  if (replyKind === "positive") {
    await leadDoc.ref.update({ estado: "interesado", updatedAt: FieldValue.serverTimestamp() });
    await db.collection("tasks").add({
      leadId: lead.id,
      title: "Llamar o escribir a lead interesado",
      description: "Respuesta afirmativa recibida por WhatsApp.",
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      assignedTo: lead.comercialAsignado ?? "admin",
      status: "pendiente",
      priority: "alta",
      createdAt: FieldValue.serverTimestamp()
    });
    await db.collection("messageQueue").add({
      leadId: lead.id,
      phone: lead.telefono,
      messageType: "text",
      body:
        "Genial, gracias. Connessia permite que tu negocio tenga una página de reservas online, agenda organizada, clientes registrados y gestión de citas desde móvil o web. Te paso una imagen/demo para que veas el estilo.",
      status: "pending",
      scheduledAt: FieldValue.serverTimestamp(),
      retries: 0
    });
  } else if (replyKind === "negative" || replyKind === "unsubscribe") {
    await leadDoc.ref.update({
      estado: replyKind === "unsubscribe" ? "baja" : "no_interesado",
      fechaBaja: replyKind === "unsubscribe" ? FieldValue.serverTimestamp() : lead.fechaBaja ?? null,
      motivoBaja: replyKind === "unsubscribe" ? message.body : lead.motivoBaja ?? null,
      updatedAt: FieldValue.serverTimestamp()
    });
    if (replyKind === "unsubscribe") {
      await db.collection("doNotContact").add({
        phone: lead.telefono,
        email: lead.email ?? "",
        reason: `Respuesta WhatsApp: ${message.body}`,
        source: "respuesta_whatsapp",
        createdAt: FieldValue.serverTimestamp()
      });
    }
    await db.collection("messageQueue").add({
      leadId: lead.id,
      phone: lead.telefono,
      messageType: "text",
      body: "Perfecto, no te molestamos más. Gracias por responder.",
      status: "pending",
      scheduledAt: FieldValue.serverTimestamp(),
      retries: 0
    });
  } else {
    await leadDoc.ref.update({ estado: "respuesta_ambigua", updatedAt: FieldValue.serverTimestamp() });
    await db.collection("tasks").add({
      leadId: lead.id,
      title: "Revisar respuesta ambigua",
      description: message.body,
      dueDate: new Date().toISOString().slice(0, 10),
      assignedTo: lead.comercialAsignado ?? "admin",
      status: "pendiente",
      priority: "media",
      createdAt: FieldValue.serverTimestamp()
    });
  }

  await db.collection("auditLogs").add({
    userId: "system",
    action: `incoming_reply_${replyKind}`,
    entityType: "lead",
    entityId: lead.id,
    details: { message: message.body, providerMessageId: message.providerMessageId },
    createdAt: FieldValue.serverTimestamp()
  });

  return { status: "processed", replyKind, leadId: lead.id };
}
