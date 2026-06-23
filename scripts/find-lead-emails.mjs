import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const XLSX = xlsx.default ?? xlsx;

const inputPath = process.argv[2];
const outputPath = process.argv[3] || "emails_encontrados_connessia.xlsx";

if (!inputPath) {
  console.error("Uso: node scripts/find-lead-emails.mjs webs_pendientes_emails_connessia.xlsx");
  process.exit(1);
}

if (!fs.existsSync(inputPath)) {
  console.error(`No existe el archivo: ${inputPath}`);
  process.exit(1);
}

const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const obfuscatedEmailRegex =
  /([A-Z0-9._%+-]+)\s*(?:@|\[\s*at\s*\]|\(\s*at\s*\)|\[\s*arroba\s*\]|\(\s*arroba\s*\)|\s+arroba\s+)\s*([A-Z0-9.-]+)\s*(?:\.|\[\s*dot\s*\]|\(\s*dot\s*\)|\[\s*punto\s*\]|\(\s*punto\s*\)|\s+punto\s+)\s*([A-Z]{2,})/gi;
const contactPaths = [
  "",
  "/contacto",
  "/contact",
  "/contacta",
  "/contactanos",
  "/contactenos",
  "/contacte",
  "/empresa",
  "/quienes-somos",
  "/sobre-nosotros",
  "/aviso-legal",
  "/legal",
  "/privacidad",
  "/politica-de-privacidad",
  "/politica-privacidad"
];
const maxPagesPerWebsite = 14;

function normalizeKey(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeWebsite(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function buildBaseUrlCandidates(baseUrl) {
  const candidates = new Map();
  const hostVariants = new Set([baseUrl.hostname]);

  if (baseUrl.hostname.startsWith("www.")) hostVariants.add(baseUrl.hostname.slice(4));
  else hostVariants.add(`www.${baseUrl.hostname}`);

  for (const protocol of ["https:", "http:"]) {
    for (const hostname of hostVariants) {
      const candidate = new URL(baseUrl.toString());
      candidate.protocol = protocol;
      candidate.hostname = hostname;
      candidate.pathname = "/";
      candidate.search = "";
      candidate.hash = "";
      candidates.set(candidate.origin, candidate);
    }
  }

  return [...candidates.values()];
}

function decodeCloudflareEmails(html) {
  return html.replace(/data-cfemail=["']([a-f0-9]+)["']|\/cdn-cgi\/l\/email-protection#([a-f0-9]+)/gi, (_match, attrHex, hashHex) => {
    const hex = attrHex || hashHex;
    if (!hex || hex.length < 4) return "";

    const key = parseInt(hex.slice(0, 2), 16);
    let decoded = "";

    for (let index = 2; index < hex.length; index += 2) {
      decoded += String.fromCharCode(parseInt(hex.slice(index, index + 2), 16) ^ key);
    }

    return decoded;
  });
}

function decodeJavascriptEscapes(value) {
  return value
    .replace(/\\u([0-9a-f]{4})/gi, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function normalizeEmail(value) {
  return String(value)
    .replace(/^mailto:/i, "")
    .split("?")[0]
    .trim()
    .toLowerCase();
}

function extractEmailsFromHtml(html) {
  const decoded = decodeJavascriptEscapes(decodeCloudflareEmails(html))
    .replace(/&#64;|&#x40;|&commat;/gi, "@")
    .replace(/&#46;|&#x2e;/gi, ".")
    .replace(/\s*\[\s*at\s*\]\s*|\s+\(at\)\s+/gi, "@")
    .replace(/\s*\[\s*dot\s*\]\s*|\s+\(dot\)\s+/gi, ".")
    .replace(/\s*\[\s*arroba\s*\]\s*|\s+\(arroba\)\s+|\s+arroba\s+/gi, "@")
    .replace(/\s*\[\s*punto\s*\]\s*|\s+\(punto\)\s+|\s+punto\s+/gi, ".");

  const emails = new Set();
  const mailtoMatches = decoded.match(/mailto:[^"'<>\s]+/gi) ?? [];
  const textMatches = decoded.match(emailRegex) ?? [];
  const obfuscatedMatches = [...decoded.matchAll(obfuscatedEmailRegex)].map((match) => `${match[1]}@${match[2]}.${match[3]}`);

  [...mailtoMatches, ...textMatches, ...obfuscatedMatches].forEach((match) => {
    const email = normalizeEmail(match);
    if (
      !email ||
      email.includes("example.") ||
      email.includes("sentry.") ||
      email.includes("@schema.") ||
      /\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(email)
    ) return;
    emails.add(email);
  });

  return [...emails];
}

function discoverLikelyContactPaths(html) {
  const paths = new Set();
  const linkRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkRegex)) {
    const href = match[1]?.trim();
    const label = match[2]?.replace(/<[^>]+>/g, " ").toLowerCase() ?? "";
    const haystack = `${href} ${label}`.toLowerCase();

    if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    if (!/(contact|contacto|contacta|legal|aviso|privacidad|privacy|empresa|quienes|sobre-nosotros)/i.test(haystack)) continue;

    try {
      const parsed = new URL(href, "https://example.com");
      paths.add(`${parsed.pathname}${parsed.search}`);
    } catch {
      // Ignore malformed links.
    }
  }

  return [...paths].slice(0, 10);
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "es-ES,es;q=0.9,en;q=0.7"
      }
    });

    if (!response.ok) return { html: "", error: `HTTP ${response.status}` };
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return { html: "", error: `No HTML: ${contentType || "desconocido"}` };
    }

    const html = await response.text();
    return { html: html.slice(0, 1_500_000), error: "" };
  } catch (error) {
    return { html: "", error: error instanceof Error ? error.message : "Error desconocido" };
  } finally {
    clearTimeout(timeout);
  }
}

async function findEmailForWebsite(website) {
  const baseUrl = normalizeWebsite(website);
  if (!baseUrl) return { email: "", emails: [], pages: 0, status: "web invalida" };

  const found = new Set();
  const visited = new Set();
  const errors = [];

  for (const baseCandidate of buildBaseUrlCandidates(baseUrl)) {
    const paths = [...contactPaths];

    for (let index = 0; index < paths.length; index += 1) {
      if (visited.size >= maxPagesPerWebsite) break;
      const url = new URL(paths[index], baseCandidate.origin);
      if (visited.has(url.toString())) continue;
      visited.add(url.toString());

      const { html, error } = await fetchHtml(url);
      if (error) errors.push(error);
      if (!html) continue;

      extractEmailsFromHtml(html).forEach((email) => found.add(email));
      if (found.size > 0) break;

      if (index === 0) {
        paths.push(...discoverLikelyContactPaths(html).filter((candidatePath) => !paths.includes(candidatePath)));
      }
    }

    if (found.size > 0 || visited.size >= maxPagesPerWebsite) break;
  }

  const emails = [...found];
  return {
    email: emails[0] ?? "",
    emails,
    pages: visited.size,
    status: emails.length > 0 ? "encontrado" : errors.slice(0, 2).join(" | ") || "sin email visible"
  };
}

function readInputRows(filePath) {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" }).map((row) => {
    const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeKey(key), String(value).trim()]));
    return {
      id: normalized.id,
      Nombre: normalized.nombre,
      Empresa: normalized.empresa,
      Web: normalized.web
    };
  });
}

function writeOutputRows(rows, filePath) {
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: ["id", "Nombre", "Empresa", "Web", "Email", "Emails", "Paginas", "Estado"]
  });
  worksheet["!cols"] = [
    { wch: 38 },
    { wch: 28 },
    { wch: 34 },
    { wch: 48 },
    { wch: 34 },
    { wch: 54 },
    { wch: 10 },
    { wch: 30 }
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Emails encontrados");
  fs.writeFileSync(filePath, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

const inputRows = readInputRows(inputPath).filter((row) => row.id && row.Web);
const outputRows = [];

console.log(`Revisando ${inputRows.length} webs...`);

for (const [index, row] of inputRows.entries()) {
  process.stdout.write(`[${index + 1}/${inputRows.length}] ${row.Empresa || row.Web}... `);
  const result = await findEmailForWebsite(row.Web);
  console.log(result.email || result.status);

  outputRows.push({
    id: row.id,
    Nombre: row.Nombre,
    Empresa: row.Empresa,
    Web: row.Web,
    Email: result.email,
    Emails: result.emails.join(", "),
    Paginas: result.pages,
    Estado: result.status
  });

  if ((index + 1) % 25 === 0) {
    writeOutputRows(outputRows, outputPath);
  }
}

writeOutputRows(outputRows, outputPath);
console.log(`Listo: ${path.resolve(outputPath)}`);
