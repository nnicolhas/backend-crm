// backend/auth/googleAuth.js

import fs from "fs";
import { google } from "googleapis";

// Detectar entorno
let SERVICE_ACCOUNT_PATH = "/etc/secrets/service_account.json"; // Render

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  SERVICE_ACCOUNT_PATH = "./config/service_account.json"; // Localhost
}

console.log("📁 Usando credenciales:", SERVICE_ACCOUNT_PATH);

// Leer JSON
const credentials = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));

// Exportar GoogleAuth centralizado
export const googleAuth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/calendar"],
});
