// backend/controllers/calendarController.js
import { google } from "googleapis";
import fs from "fs";

/* ------------------------------------------------ */
/*              LOAD GOOGLE CREDENTIALS            */
/* ------------------------------------------------ */

const googleConfig = JSON.parse(
  fs.readFileSync("./config/client_secret.json", "utf8") ||
  fs.readFileSync("./config/google.json", "utf8")
);

/*
El JSON debe tener formato:

{
  "web": {
    "client_id": "...",
    "client_secret": "...",
    "redirect_uris": ["http://localhost:4000/calendar/redirect"],
    "javascript_origins": ["http://localhost:5173"]
  }
}
*/

let oauth2Client = new google.auth.OAuth2(
  googleConfig.web.client_id,
  googleConfig.web.client_secret,
  googleConfig.web.redirect_uris[0]
);

// Tokens guardados en memoria (si querés te lo paso a Mongo)
let tokens = null;

/* ------------------------------------------------ */
/*                AUTH URL GENERATOR               */
/* ------------------------------------------------ */

export const authUrl = (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"],
  });

  res.json({ url });
};

/* ------------------------------------------------ */
/*              GOOGLE REDIRECT HANDLER            */
/* ------------------------------------------------ */

export const handleGoogleRedirect = async (req, res) => {
  const code = req.query.code;

  try {
    const { tokens: newTokens } = await oauth2Client.getToken(code);
    tokens = newTokens;
    oauth2Client.setCredentials(tokens);

    console.log("✅ Google Calendar conectado correctamente.");

    res.send(`
      <h2>Cuenta conectada con Google Calendar ✔</h2>
      <p>Ya podés cerrar esta ventana y volver a tu CRM.</p>
    `);
  } catch (err) {
    console.error("❌ Error al conectar con Google:", err);
    res.status(500).send("Error al conectar con Google");
  }
};

/* ------------------------------------------------ */
/*                 GET ALL EVENTS                  */
/* ------------------------------------------------ */

export const getEvents = async (req, res) => {
  if (!tokens)
    return res
      .status(401)
      .json({ error: "No autenticado con Google Calendar" });

  try {
    oauth2Client.setCredentials(tokens);

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const response = await calendar.events.list({
      calendarId: "primary",
      maxResults: 200,
      singleEvents: true,
      orderBy: "startTime",
    });

    res.json(response.data.items);
  } catch (err) {
    console.error("❌ Error al obtener eventos:", err);
    res.status(500).json({ error: "Error al obtener eventos" });
  }
};

/* ------------------------------------------------ */
/*                 CREATE EVENT                    */
/* ------------------------------------------------ */

export const createEvent = async (req, res) => {
  const { summary, description, start, end } = req.body;

  if (!tokens)
    return res.status(401).json({ error: "No autenticado con Google" });

  try {
    oauth2Client.setCredentials(tokens);

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const event = {
      summary,
      description,
      start: { dateTime: start },
      end: { dateTime: end },
    };

    const result = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

    res.json(result.data);
  } catch (err) {
    console.error("❌ Error al crear evento:", err);
    res.status(500).json({ error: "Error al crear evento" });
  }
};

/* ------------------------------------------------ */
/*                 UPDATE EVENT                    */
/* ------------------------------------------------ */

export const updateEvent = async (req, res) => {
  const { id } = req.params;
  const { summary, description, start, end } = req.body;

  if (!tokens)
    return res.status(401).json({ error: "No autenticado con Google" });

  try {
    oauth2Client.setCredentials(tokens);

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const event = {
      summary,
      description,
      start: { dateTime: start },
      end: { dateTime: end },
    };

    const result = await calendar.events.update({
      calendarId: "primary",
      eventId: id,
      requestBody: event,
    });

    res.json(result.data);
  } catch (err) {
    console.error("❌ Error al actualizar evento:", err);
    res.status(500).json({ error: "Error al actualizar evento" });
  }
};

/* ------------------------------------------------ */
/*                 DELETE EVENT                    */
/* ------------------------------------------------ */

export const deleteEvent = async (req, res) => {
  const { id } = req.params;

  if (!tokens)
    return res.status(401).json({ error: "No autenticado con Google" });

  try {
    oauth2Client.setCredentials(tokens);

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    await calendar.events.delete({
      calendarId: "primary",
      eventId: id,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error al borrar evento:", err);
    res.status(500).json({ error: "Error al borrar evento" });
  }
};
