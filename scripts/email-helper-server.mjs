import http from "node:http";
import { findEmailForWebsite } from "./find-lead-emails.mjs";

const port = Number(process.env.CONNESSIA_EMAIL_HELPER_PORT || 3217);
const maxLeadsPerRequest = 50;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true, service: "connessia-email-helper", port });
    return;
  }

  if (req.method !== "POST" || req.url !== "/find-emails") {
    sendJson(res, 404, { ok: false, error: "Ruta no encontrada." });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const leads = Array.isArray(body.leads) ? body.leads.slice(0, maxLeadsPerRequest) : [];

    if (leads.length === 0) {
      sendJson(res, 400, { ok: false, error: "No se recibieron leads." });
      return;
    }

    const results = [];
    const updates = [];

    for (const lead of leads) {
      const id = String(lead.id || "");
      const web = String(lead.web || "");
      const name = String(lead.nombreNegocio || lead.empresa || lead.nombre || web);

      if (!id || !web) {
        results.push({ id, web, name, email: "", emails: [], pages: 0, status: "Lead sin id o web." });
        continue;
      }

      const result = await findEmailForWebsite(web);
      const nextResult = {
        id,
        web,
        name,
        email: result.email,
        emails: result.emails,
        pages: result.pages,
        status: result.status
      };
      results.push(nextResult);

      if (result.email) updates.push({ id, email: result.email });
      console.log(`[${result.email ? "OK" : "--"}] ${name}: ${result.email || result.status}`);
    }

    sendJson(res, 200, { ok: true, checked: results.length, found: updates.length, updates, results });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Error desconocido."
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Connessia email helper listo en http://127.0.0.1:${port}`);
  console.log("Deja esta ventana abierta y usa Revisar emails > Buscar en local desde la app.");
});
