# Connessia Leads

PWA/CRM comercial para gestionar leads, importar prospectos, registrar consentimiento WhatsApp, preparar mensajes y abrir conversaciones en WhatsApp Web.

El modo principal es WhatsApp Web manual: la app deja el chat abierto con el telefono y el texto preparados, pero el envio lo confirma una persona desde WhatsApp Web.

## Stack

- React + Vite + TypeScript
- Tailwind CSS
- Firebase Auth, Firestore, Storage y Hosting
- Firebase Functions preparadas para backend futuro
- PWA con manifest

## Instalacion

```bash
npm install
npm run dev
```

Para Functions:

```bash
npm --prefix functions install
npm run functions:build
```

## Configuracion Firebase

Puedes configurar Firebase desde la pestana `Firebase` de la app. Copia los valores de Firebase Console, en Configuracion del proyecto y tu app web:

- API key
- Auth domain
- Project ID
- Storage bucket
- Messaging sender ID
- App ID
- Measurement ID, si lo tienes

Los datos se guardan en este navegador para no tener que editar `.env` mientras pruebas.

## Mini Tutorial

1. Abre `Firebase` y pega los datos de tu app web de Firebase.
2. Abre `Canal WhatsApp`, deja seleccionado `WhatsApp Web manual` y guarda.
3. En `Importar`, sube un CSV de leads o crea leads manualmente en `Leads`.
4. Crea grupos en `Leads` y asigna cada lead a uno o varios grupos.
5. Revisa que los leads tengan telefono con prefijo internacional, por ejemplo `+34600111222`, y consentimiento WhatsApp.
6. En `Campanas`, selecciona los grupos incluidos, marca el checklist legal y pulsa `Validar y encolar campana`.
7. En la cola, pulsa `Abrir chat` o `Abrir siguiente en WhatsApp Web`.
8. WhatsApp Web se abrira con el texto preparado. Revisa el mensaje y pulsa enviar manualmente.
9. Vuelve a la app y pulsa `Marcar enviado`.
10. Gestiona `Tareas` y `Demos` desde sus pantallas: puedes crear, editar y borrar registros.
11. Si el cliente responde, usa `Simulador` para registrar `SI`, `NO`, `BAJA` o una respuesta ambigua.

## Modo Demo

La aplicacion arranca con datos locales y persistencia en `localStorage`. Puedes:

- Cambiar el rol demo entre `admin`, `comercial` y `visor`.
- Importar `public/leads-ejemplo.csv`.
- Crear grupos de leads y asignarlos a campanas.
- Eliminar leads junto con sus tareas, demos, mensajes y cola relacionada.
- Validar una campana con checklist RGPD/LSSI.
- Encolar mensajes.
- Abrir cada mensaje en WhatsApp Web y marcarlo como enviado.
- Crear, editar y borrar tareas comerciales y demos.
- Simular respuestas `SI`, `NO`, `BAJA` o ambiguas.
- Ver como se actualizan leads, tareas, exclusiones, mensajes y metricas.

## WhatsApp Web

La abstraccion vive en `src/services/whatsappProvider.ts`.

El enlace generado usa:

```text
https://web.whatsapp.com/send?phone=TELEFONO&text=MENSAJE
```

No hay tokens de WhatsApp, webhooks ni APIs en el frontend. Para enviar, una persona debe estar logueada en WhatsApp Web y pulsar enviar.

## Estructura Principal

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

## Compliance

La app aplica estas barreras:

- No encola mensajes sin consentimiento.
- No envia a bajas, bloqueados o telefonos invalidos.
- Consulta `doNotContact`.
- Exige plantilla inicial aprobada.
- Exige checklist legal antes de activar campana.
- Registra mensajes, respuestas, tareas y auditoria.
- Corta automatizacion ante `BAJA`, `STOP`, `NO QUIERO` y equivalentes.

## Deploy Firebase

```bash
npm run build
npm run functions:build
firebase deploy
```
