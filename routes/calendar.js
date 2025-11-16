// backend/routes/calendar.js
import { Router } from "express";
import {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
} from "../controllers/calendarController.js";

const router = Router();

/* ------------------------------------------------ */
/*              GOOGLE CALENDAR ROUTES              */
/* ------------------------------------------------ */

// Obtener todos los eventos
router.get("/events", getEvents);

// Crear evento
router.post("/events", createEvent);

// Editar evento
router.put("/events/:id", updateEvent);

// Borrar evento
router.delete("/events/:id", deleteEvent);

export default router;
