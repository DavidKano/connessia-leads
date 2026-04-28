# Connessia Leads

PWA/CRM comercial para gestionar leads de Connessia, importar prospectos, registrar consentimiento WhatsApp, lanzar campañas permitidas, simular respuestas SI/NO y preparar la integración con WhatsApp Business Platform o proveedores oficiales como Spoki, Twilio y 360dialog.

La app no usa WhatsApp Web, Selenium, Puppeteer ni automatizaciones no oficiales. El proveedor activo por defecto es `mock`, pensado para probar el flujo sin llamadas externas.

## Stack

- React + Vite + TypeScript
- Tailwind CSS
- Firebase Auth, Firestore, Storage y Hosting
- Firebase Functions para webhook, cola y proveedor WhatsApp
- PWA con manifest

## Instalación

```bash
npm install
npm run dev
```

Para Functions:

```bash
npm --prefix functions install
npm run functions:build
```

## Variables de entorno

Copia `.env.example` a `.env` y rellena Firebase:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Los secretos de WhatsApp deben configurarse en backend o Secret Manager, no en frontend:

```bash
WHATSAPP_PROVIDER=mock
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
SPOKI_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
```

## Modo demo

La aplicación arranca con datos locales y persistencia en `localStorage`. Puedes:

- Cambiar el rol demo entre `admin`, `comercial` y `visor`.
- Importar `public/leads-ejemplo.csv`.
- Validar una campaña con checklist RGPD/LSSI.
- Encolar mensajes.
- Procesar la cola con el `MockWhatsAppProvider`.
- Simular respuestas `SI`, `NO`, `BAJA` o ambiguas.
- Ver cómo se actualizan leads, tareas, exclusiones, mensajes y métricas.

## Estructura principal

```text
src/
  App.tsx
  components/
  data/demoData.ts
  services/
    campaignEngine.ts
    crmStore.ts
    firebase.ts
    importService.ts
    whatsappProvider.ts
  types/domain.ts
functions/
  src/
    providers/whatsappProvider.ts
    webhooks/whatsappWebhook.ts
    engine/campaignEngine.ts
    queue/processMessageQueue.ts
```

## Firestore

Colecciones preparadas:

- `users`
- `leads`
- `campaigns`
- `messageTemplates`
- `messages`
- `messageQueue`
- `doNotContact`
- `tasks`
- `demos`
- `auditLogs`
- `assets`
- `settings`

Las reglas están en `firestore.rules`. Puntos clave:

- Solo usuarios autenticados.
- `admin` puede leer/escribir casi todo.
- `comercial` solo ve leads asignados y actualiza campos comerciales.
- `visor` solo lectura.
- El frontend no puede escribir directamente en `messageQueue`, `messages` ni `auditLogs`.
- Configuración sensible del proveedor queda fuera del frontend.

## WhatsApp oficial

La abstracción vive en:

- Frontend: `src/services/whatsappProvider.ts`
- Backend: `functions/src/providers/whatsappProvider.ts`

Interfaz:

```ts
interface WhatsAppProvider {
  sendTemplateMessage(params): Promise<SendResult>;
  sendTextMessage(params): Promise<SendResult>;
  sendMediaMessage(params): Promise<SendResult>;
  verifyWebhook(req): boolean;
  parseIncomingMessage(req): IncomingMessage | null;
}
```

Implementado:

- `MockWhatsAppProvider`

Preparados con TODOs seguros:

- `MetaCloudWhatsAppProvider`
- `SpokiWhatsAppProvider`
- `TwilioWhatsAppProvider`
- `Dialog360WhatsAppProvider`

Para producción debes:

1. Verificar el número en WhatsApp Business.
2. Configurar el proveedor oficial.
3. Guardar tokens en Functions/Secret Manager.
4. Usar plantillas aprobadas para mensajes iniciales.
5. Configurar el webhook `whatsappWebhook`.
6. Activar `processMessageQueue`.

## Compliance

La app aplica estas barreras:

- No encola mensajes sin consentimiento.
- No envía a bajas, bloqueados o teléfonos inválidos.
- Consulta `doNotContact`.
- Exige plantilla inicial aprobada.
- Exige checklist legal antes de activar campaña.
- Registra mensajes, respuestas, tareas y auditoría.
- Corta automatización ante `BAJA`, `STOP`, `NO QUIERO` y equivalentes.

## Deploy Firebase

```bash
npm run build
npm run functions:build
firebase deploy
```

Antes de desplegar, crea usuarios en Firebase Auth y documentos en `users` con `role`.
