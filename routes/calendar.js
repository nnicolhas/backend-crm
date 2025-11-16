// backend/routes/calendar.js
import { Router } from "express";
import {
  authUrl,
  handleGoogleRedirect,
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
} from "../controllers/calendarController.js";

const router = Router();

/* ------------------------------------------------ */
/*                GOOGLE CALENDAR ROUTES           */
/* ------------------------------------------------ */

// ➤ Genera la URL para conectar Google
router.get("/auth", authUrl);

// ➤ Google redirige acá con el "code"
router.get("/redirect", handleGoogleRedirect);

// ➤ Obtener todos los eventos
router.get("/events", getEvents);

// ➤ Crear evento nuevo
router.post("/events", createEvent);

// ➤ Editar evento por ID
router.put("/events/:id", updateEvent);

// ➤ Borrar evento por ID
router.delete("/events/:id", deleteEvent);

export default router;
