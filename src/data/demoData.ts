import type {
  AppUser,
  Campaign,
  CommercialAsset,
  Demo,
  DoNotContact,
  Lead,
  Message,
  MessageTemplate,
  QueueItem,
  Settings,
  Task
} from "../types/domain";

const now = new Date().toISOString();

export const demoUsers: AppUser[] = [
  {
    uid: "admin-demo",
    nombre: "David Admin",
    email: "admin@connessia.demo",
    role: "admin",
    activo: true,
    createdAt: now
  },
  {
    uid: "comercial-ana",
    nombre: "Ana Comercial",
    email: "ana@connessia.demo",
    role: "comercial",
    activo: true,
    createdAt: now
  },
  {
    uid: "visor-demo",
    nombre: "Visor Demo",
    email: "visor@connessia.demo",
    role: "visor",
    activo: true,
    createdAt: now
  }
];

export const demoLeads: Lead[] = [
  {
    id: "lead-1",
    nombreNegocio: "Clínica Fisio Aljarafe",
    personaContacto: "Marta Ruiz",
    telefono: "+34600111222",
    email: "marta@fisioaljarafe.es",
    direccion: "Av. de la Salud 12",
    ciudad: "Sevilla",
    zona: "Sevilla Este",
    sector: "fisioterapia",
    web: "https://fisioaljarafe.example",
    notas: "Tiene saturación de llamadas por la tarde.",
    estado: "consentimiento_obtenido",
    etiquetas: ["prioridad", "agenda_online"],
    comercialAsignado: "comercial-ana",
    tieneConsentimientoWhatsapp: true,
    fechaConsentimiento: "2026-04-18T10:20:00.000Z",
    origenConsentimiento: "llamada",
    textoConsentimientoAceptado:
      "Acepto recibir información comercial de Connessia por WhatsApp y puedo solicitar la baja en cualquier momento.",
    ultimoContacto: "2026-04-26T10:00:00.000Z",
    proximaAccion: "Enviar campaña inicial",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "lead-2",
    nombreNegocio: "Peluquería Luz",
    personaContacto: "Luz Herrera",
    telefono: "+34600333444",
    email: "hola@peluluz.es",
    direccion: "Calle Feria 21",
    ciudad: "Sevilla",
    zona: "Centro",
    sector: "peluquería",
    web: "",
    notas: "Interés en recordatorios automáticos.",
    estado: "interesado",
    etiquetas: ["respondio_si"],
    comercialAsignado: "comercial-ana",
    tieneConsentimientoWhatsapp: true,
    fechaConsentimiento: "2026-04-20T12:10:00.000Z",
    origenConsentimiento: "formulario web",
    ipConsentimiento: "81.44.10.22",
    urlOrigenConsentimiento: "https://connessia.example/landing-sevilla",
    ultimoContacto: "2026-04-28T09:00:00.000Z",
    proximaAccion: "Agendar demo",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "lead-3",
    nombreNegocio: "Academia Norte",
    personaContacto: "Carlos Peña",
    telefono: "+34600555666",
    email: "direccion@academianorte.es",
    direccion: "Calle Innovación 5",
    ciudad: "Sevilla",
    zona: "Macarena",
    sector: "academia",
    web: "https://academianorte.example",
    notas: "Importado sin consentimiento.",
    estado: "pendiente_consentimiento",
    etiquetas: ["prospecto"],
    comercialAsignado: "admin-demo",
    tieneConsentimientoWhatsapp: false,
    ultimoContacto: "",
    proximaAccion: "Solicitar consentimiento por canal permitido",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "lead-4",
    nombreNegocio: "Estética Nara",
    personaContacto: "Nara Gómez",
    telefono: "+34600777888",
    email: "info@esteticanara.es",
    direccion: "Calle Jardín 18",
    ciudad: "Dos Hermanas",
    zona: "Sevilla Este",
    sector: "estética",
    web: "",
    notas: "Pidió no recibir más comunicaciones.",
    estado: "baja",
    etiquetas: ["exclusion"],
    comercialAsignado: "comercial-ana",
    tieneConsentimientoWhatsapp: true,
    fechaConsentimiento: "2026-04-16T08:30:00.000Z",
    origenConsentimiento: "email",
    fechaBaja: "2026-04-27T11:00:00.000Z",
    motivoBaja: "Respuesta BAJA",
    ultimoContacto: "2026-04-27T11:00:00.000Z",
    proximaAccion: "No contactar",
    createdAt: now,
    updatedAt: now
  }
];

export const demoTemplates: MessageTemplate[] = [
  {
    id: "tpl-inicial",
    nombre: "Prospección Connessia Sevilla",
    tipo: "plantilla_inicial",
    proveedor: "mock",
    externalTemplateId: "connessia_leads_demo_es",
    idioma: "es",
    categoria: "marketing",
    body:
      "Hola {{persona_contacto}}, soy {{nombre_comercial}} de Connessia. Estamos estudiando negocios de {{zona}} que puedan mejorar su gestión de citas con una agenda online y reservas automáticas. ¿Te gustaría ver una demo sencilla adaptada a {{nombre_negocio}}? Responde SI para enviarte información o NO si prefieres que no te contactemos más.",
    variables: [
      "nombre_negocio",
      "persona_contacto",
      "sector",
      "zona",
      "nombre_comercial",
      "link_demo",
      "link_landing"
    ],
    estado: "aprobada",
    createdAt: now
  },
  {
    id: "tpl-info",
    nombre: "Información tras SI",
    tipo: "plantilla_info",
    proveedor: "mock",
    idioma: "es",
    categoria: "utility",
    body:
      "Genial, gracias. Connessia permite que tu negocio tenga una página de reservas online, agenda organizada, clientes registrados y gestión de citas desde móvil o web. La idea es que dejes de depender solo de llamadas o mensajes sueltos de WhatsApp.\n\nTe paso una imagen/demo para que veas el estilo. Si quieres, también podemos prepararte una demo con el nombre y colores de tu negocio.",
    variables: ["nombre_negocio", "persona_contacto", "nombre_comercial", "link_demo"],
    estado: "aprobada",
    createdAt: now
  },
  {
    id: "tpl-seguimiento",
    nombre: "Seguimiento único",
    tipo: "plantilla_seguimiento",
    proveedor: "mock",
    idioma: "es",
    categoria: "marketing",
    body:
      "Hola {{persona_contacto}}, te escribo solo una vez más por si quieres ver cómo quedaría una agenda online para {{nombre_negocio}}. Si no te interesa, responde NO y cerramos el contacto.",
    variables: ["nombre_negocio", "persona_contacto"],
    estado: "aprobada",
    createdAt: now
  },
  {
    id: "tpl-baja",
    nombre: "Confirmación baja",
    tipo: "plantilla_baja",
    proveedor: "mock",
    idioma: "es",
    categoria: "utility",
    body: "Perfecto, no te molestamos más. Gracias por responder.",
    variables: [],
    estado: "aprobada",
    createdAt: now
  }
];

export const demoAssets: CommercialAsset[] = [
  {
    id: "asset-demo-img",
    name: "Demo agenda Connessia",
    type: "imagen",
    url: "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=1200&q=80",
    storagePath: "assets/demo-agenda-connessia.jpg",
    createdAt: now
  },
  {
    id: "asset-pdf",
    name: "PDF comercial Connessia",
    type: "pdf",
    url: "https://example.com/connessia-demo.pdf",
    storagePath: "assets/connessia-demo.pdf",
    createdAt: now
  }
];

export const demoCampaigns: Campaign[] = [
  {
    id: "camp-sevilla-este",
    nombre: "Prospección Connessia Sevilla Este",
    descripcion: "Campaña inicial para negocios con cita previa y consentimiento trazable.",
    segmento: {
      zonas: ["Sevilla Este"],
      sectores: ["peluquería", "estética", "fisioterapia", "clínicas"],
      requireConsent: true
    },
    estado: "borrador",
    plantillaInicialId: "tpl-inicial",
    plantillaSeguimientoId: "tpl-seguimiento",
    plantillaInfoId: "tpl-info",
    assetInfoId: "asset-demo-img",
    maxSeguimientos: 1,
    diasParaSeguimiento: 3,
    dailyLimit: 80,
    createdBy: "admin-demo",
    createdAt: now,
    updatedAt: now
  }
];

export const demoMessages: Message[] = [
  {
    id: "msg-1",
    leadId: "lead-2",
    campaignId: "camp-sevilla-este",
    direction: "outbound",
    channel: "whatsapp",
    body: "Mensaje inicial enviado en simulación.",
    providerMessageId: "mock_001",
    status: "sent",
    createdAt: "2026-04-28T08:55:00.000Z"
  },
  {
    id: "msg-2",
    leadId: "lead-2",
    campaignId: "camp-sevilla-este",
    direction: "inbound",
    channel: "whatsapp",
    body: "Sí, me interesa",
    status: "received",
    createdAt: "2026-04-28T09:00:00.000Z"
  }
];

export const demoQueue: QueueItem[] = [];

export const demoDoNotContact: DoNotContact[] = [
  {
    id: "dnc-1",
    phone: "+34600777888",
    email: "info@esteticanara.es",
    reason: "Solicitó baja por WhatsApp",
    source: "respuesta_whatsapp",
    createdAt: "2026-04-27T11:00:00.000Z"
  }
];

export const demoTasks: Task[] = [
  {
    id: "task-1",
    leadId: "lead-2",
    title: "Llamar o escribir a lead interesado",
    description: "Respondió SI. Preparar propuesta de demo personalizada.",
    dueDate: "2026-04-29",
    assignedTo: "comercial-ana",
    status: "pendiente",
    priority: "alta",
    createdAt: now
  }
];

export const demoDemos: Demo[] = [
  {
    id: "demo-1",
    leadId: "lead-2",
    date: "2026-04-30",
    time: "10:30",
    assignedTo: "comercial-ana",
    status: "programada",
    notes: "Mostrar agenda con estética visual del negocio.",
    meetingUrl: "https://meet.google.com/demo-connessia",
    createdAt: now
  }
];

export const demoSettings: Settings = {
  whatsappProvider: "mock",
  dailyLimit: 120,
  hourlyLimit: 20,
  emergencyPaused: false,
  businessName: "Connessia",
  defaultCommercialName: "David",
  whatsappChannel: {
    provider: "mock",
    businessPhone: "+34955000000",
    businessAccountId: "simulado",
    phoneNumberId: "simulado",
    webhookVerifyToken: "demo_verify_token",
    connectionStatus: "simulado"
  }
};
