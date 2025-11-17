import { google } from "googleapis";
import fs from "fs";

/* ------------------------------------------------ */
/*     DETECTAR AUTOMÁTICAMENTE DÓNDE ESTÁ EL JSON  */
/* ------------------------------------------------ */

let SERVICE_ACCOUNT_PATH = "/etc/secrets/service_account.json"; // Render

// Si NO existe ese archivo, usar el local
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  SERVICE_ACCOUNT_PATH = "./config/service_account.json"; // Localhost
}

console.log("📁 Usando credenciales desde:", SERVICE_ACCOUNT_PATH);

/* ------------------------------------------------ */
/*          CARGAR CREDENCIALES SERVICE ACCOUNT     */
/* ------------------------------------------------ */

let serviceAcc;

try {
  serviceAcc = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
  console.log("🔐 Service Account cargada OK.");
} catch (err) {
  console.error("❌ ERROR leyendo credenciales:", SERVICE_ACCOUNT_PATH);
  console.error(err);
  throw err;
}

/* ------------------------------------------------ */
/*              AUTENTICACIÓN GOOGLE                */
/* ------------------------------------------------ */

const auth = new google.auth.GoogleAuth({
  credentials: serviceAcc,
  scopes: ["https://www.googleapis.com/auth/calendar"],
});

const calendar = google.calendar({
  version: "v3",
  auth,
});

const CALENDAR_ID = "bicodeservices.info@gmail.com";

/* ------------------------------------------------ */
/*                     GET EVENTS                   */
/* ------------------------------------------------ */

export const getEvents = async (req, res) => {
  try {
    const resp = await calendar.events.list({
      calendarId: CALENDAR_ID,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 200,
      timeMin: new Date(2000, 0, 1).toISOString(),
    });

    res.json(resp.data.items || []);
  } catch (err) {
    console.error("❌ Error Google GET:", err?.response?.data || err);
    res.status(500).json({ error: "Error al obtener eventos" });
  }
};

/* ------------------------------------------------ */
/*                    CREATE EVENT                  */
/* ------------------------------------------------ */

export const createEvent = async (req, res) => {
  try {
    const newEvent = {
      summary: req.body.title,
      description: req.body.description || "",
      start: { dateTime: req.body.start },
      end: { dateTime: req.body.end },
    };

    const result = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: newEvent,
    });

    res.json(result.data);
  } catch (err) {
    console.error("❌ Error Google CREATE:", err?.response?.data || err);
    res.status(500).json({ error: "Error al crear evento" });
  }
};

/* ------------------------------------------------ */
/*                    UPDATE EVENT                  */
/* ------------------------------------------------ */

export const updateEvent = async (req, res) => {
  const { id } = req.params;

  try {
    const updatedEvent = {
      summary: req.body.title,
      description: req.body.description || "",
      start: { dateTime: req.body.start },
      end: { dateTime: req.body.end },
    };

    const result = await calendar.events.update({
      calendarId: CALENDAR_ID,
      eventId: id,
      requestBody: updatedEvent,
    });

    res.json(result.data);
  } catch (err) {
    console.error("❌ Error Google UPDATE:", err?.response?.data || err);
    res.status(500).json({ error: "Error al actualizar evento" });
  }
};

/* ------------------------------------------------ */
/*                    DELETE EVENT                  */
/* ------------------------------------------------ */

export const deleteEvent = async (req, res) => {
  const { id } = req.params;

  try {
    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId: id,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error Google DELETE:", err?.response?.data || err);
    res.status(500).json({ error: "Error al borrar evento" });
  }
};
