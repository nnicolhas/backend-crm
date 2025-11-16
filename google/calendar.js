import { google } from "googleapis";
import fs from "fs";
import path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export async function getGoogleCalendarEvents() {
  const CREDENTIALS = path.join(__dirname, "google", "credentials.json");

  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });

  const client = await auth.getClient();
  const calendar = google.calendar({ version: "v3", auth: client });

  const res = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID, // <--- IMPORTANTE
    singleEvents: true,
    orderBy: "startTime",
  });

  return res.data.items;
}
