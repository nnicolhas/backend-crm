// backend/server.js
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { createServer } from "http";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import calendarRoutes from "./routes/calendar.js"; // NUEVO: integración Google Calendar OAuth

dotenv.config();

/* ------------------------------------------------ */
/*               CONFIG RUTAS / PATH                */
/* ------------------------------------------------ */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(
  cors({
    origin: "*",
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type,Authorization",
  })
);

app.use(express.json());

/* ------------------------------------------------ */
/*          HTTP SERVER + SOCKET.IO                */
/* ------------------------------------------------ */

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

/* ------------------------------------------------ */
/*                MONGODB SETUP                     */
/* ------------------------------------------------ */

const client = new MongoClient(process.env.MONGO_URI);
let db = null;

async function startServer() {
  try {
    await client.connect();
    db = client.db("crm");
    console.log("✅ MongoDB conectado");

    const PORT = process.env.PORT || 4000;
    httpServer.listen(PORT, () =>
      console.log(`🚀 Backend corriendo en puerto ${PORT}`)
    );
  } catch (err) {
    console.error("❌ Error al conectar MongoDB:", err);
    process.exit(1);
  }
}
startServer();

/* ------------------------------------------------ */
/*        GOOGLE CALENDAR OAUTH (NUEVO)            */
/* ------------------------------------------------ */

app.use("/calendar", calendarRoutes);
/*
Rutas disponibles:
GET  /calendar/auth
GET  /calendar/redirect
GET  /calendar/events
POST /calendar/events
PUT  /calendar/events/:id
DELETE /calendar/events/:id
*/

/* ------------------------------------------------ */
/*        SOCKET.IO: ONLINE USERS + HEARTBEAT       */
/* ------------------------------------------------ */

let onlineUsers = new Map();

async function updateLastSeen(username) {
  await db.collection("users_status").updateOne(
    { username },
    { $set: { lastSeen: new Date().toISOString() } },
    { upsert: true }
  );
}

async function broadcastUserStatus() {
  const lastSeenList = await db.collection("users_status").find().toArray();

  io.emit(
    "online-users",
    [...onlineUsers.values()].map((u) => u.username)
  );

  io.emit("last-seen-users", lastSeenList);
}

io.on("connection", (socket) => {
  console.log("🔌 Cliente conectado:", socket.id);

  socket.on("join", async (username) => {
    onlineUsers.set(socket.id, {
      username,
      lastBeat: Date.now(),
    });

    await updateLastSeen(username);
    broadcastUserStatus();
  });

  socket.on("heartbeat", () => {
    if (onlineUsers.has(socket.id)) {
      const data = onlineUsers.get(socket.id);
      data.lastBeat = Date.now();
      onlineUsers.set(socket.id, data);
    }
  });

  socket.on("disconnect", async () => {
    const userData = onlineUsers.get(socket.id);

    if (userData) {
      await updateLastSeen(userData.username);
      onlineUsers.delete(socket.id);
    }

    broadcastUserStatus();
    console.log("❌ Cliente desconectado:", socket.id);
  });

  /* CRM EVENTS */
  socket.on("client-updated", (client) => io.emit("client-updated", client));
  socket.on("client-deleted", (id) => io.emit("client-deleted", id));
  socket.on("task-updated", (task) => io.emit("task-updated", task));
  socket.on("task-deleted", (id) => io.emit("task-deleted", id));
  socket.on("activity-updated", (log) => io.emit("activity-updated", log));
  socket.on("expense-updated", (exp) => io.emit("expense-updated", exp));
  socket.on("expense-deleted", (id) => io.emit("expense-deleted", id));
});

setInterval(async () => {
  const now = Date.now();

  for (const [socketId, userData] of onlineUsers.entries()) {
    if (now - userData.lastBeat > 12000) {
      await updateLastSeen(userData.username);
      onlineUsers.delete(socketId);
    }
  }

  broadcastUserStatus();
}, 4000);

/* ------------------------------------------------ */
/*             ROUTE DE PRUEBA                     */
/* ------------------------------------------------ */

app.get("/", (req, res) => {
  res.json({ ok: true, msg: "🔥 CRM Backend funcionando" });
});

/* ------------------------------------------------ */
/*              HELPERS NORMALIZACIÓN              */
/* ------------------------------------------------ */

function cleanHTML(text) {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function normalizeID(obj) {
  return { ...obj, id: obj._id?.toString(), _id: undefined };
}

/* ------------------------------------------------ */
/*                API: CLIENTES CRUD               */
/* ------------------------------------------------ */

app.get("/clients", async (req, res) => {
  const list = await db.collection("clients").find().toArray();
  res.json(list.map(normalizeID));
});

app.post("/clients", async (req, res) => {
  const data = { ...req.body, createdAt: new Date().toISOString() };

  const result = await db.collection("clients").insertOne(data);
  const full = normalizeID({ ...data, _id: result.insertedId });

  io.emit("client-updated", full);
  res.json(full);
});

app.put("/clients/:id", async (req, res) => {
  const id = req.params.id;

  await db
    .collection("clients")
    .updateOne({ _id: new ObjectId(id) }, { $set: req.body });

  const updated = await db
    .collection("clients")
    .findOne({ _id: new ObjectId(id) });

  const full = normalizeID(updated);

  io.emit("client-updated", full);
  res.json(full);
});

app.delete("/clients/:id", async (req, res) => {
  const id = req.params.id;

  await db.collection("clients").deleteOne({ _id: new ObjectId(id) });

  io.emit("client-deleted", id);
  res.json({ ok: true });
});

/* ------------------------------------------------ */
/*               API: ACTIVIDAD CRUD               */
/* ------------------------------------------------ */

app.get("/activities", async (req, res) => {
  const list = await db
    .collection("activities")
    .find()
    .sort({ timestamp: -1 })
    .limit(40)
    .toArray();

  res.json(list.map(normalizeID));
});

app.post("/activities", async (req, res) => {
  const log = {
    user: req.body.user,
    action: cleanHTML(req.body.action),
    timestamp: req.body.timestamp,
  };

  const result = await db.collection("activities").insertOne(log);
  const full = normalizeID({ ...log, _id: result.insertedId });

  io.emit("activity-updated", full);
  res.json(full);
});

/* ------------------------------------------------ */
/*               API: TASKS CRUD                   */
/* ------------------------------------------------ */

app.get("/tasks", async (req, res) => {
  const tasks = await db.collection("tasks").find().toArray();
  res.json(tasks.map(normalizeID));
});

app.post("/tasks", async (req, res) => {
  const task = {
    user: req.body.user,
    day: req.body.day,
    text: req.body.text,
    createdAt: new Date().toISOString(),
  };

  const result = await db.collection("tasks").insertOne(task);
  const full = normalizeID({ ...task, _id: result.insertedId });

  io.emit("task-updated", full);
  res.json(full);
});

app.put("/tasks/:id", async (req, res) => {
  const id = req.params.id;

  await db
    .collection("tasks")
    .updateOne({ _id: new ObjectId(id) }, { $set: req.body });

  const updated = await db
    .collection("tasks")
    .findOne({ _id: new ObjectId(id) });

  const full = normalizeID(updated);

  io.emit("task-updated", full);
  res.json(full);
});

app.delete("/tasks/:id", async (req, res) => {
  const id = req.params.id;

  await db.collection("tasks").deleteOne({ _id: new ObjectId(id) });

  io.emit("task-deleted", id);
  res.json({ ok: true });
});

/* ------------------------------------------------ */
/*             API: EXPENSES CRUD                  */
/* ------------------------------------------------ */

app.get("/expenses", async (req, res) => {
  const list = await db.collection("expenses").find().toArray();
  res.json(list.map(normalizeID));
});

app.post("/expenses", async (req, res) => {
  const exp = {
    title: req.body.title,
    cost: Number(req.body.cost),
    type: req.body.type,
    renewDay: req.body.type === "monthly" ? Number(req.body.renewDay) : null,
    category: req.body.category || "",
    createdAt: new Date().toISOString(),
  };

  const result = await db.collection("expenses").insertOne(exp);
  const full = normalizeID({ ...exp, _id: result.insertedId });

  io.emit("expense-updated", full);
  res.json(full);
});

app.put("/expenses/:id", async (req, res) => {
  const id = req.params.id;

  await db
    .collection("expenses")
    .updateOne({ _id: new ObjectId(id) }, { $set: req.body });

  const updated = await db
    .collection("expenses")
    .findOne({ _id: new ObjectId(id) });

  const full = normalizeID(updated);

  io.emit("expense-updated", full);
  res.json(full);
});

app.delete("/expenses/:id", async (req, res) => {
  const id = req.params.id;

  await db.collection("expenses").deleteOne({ _id: new ObjectId(id) });

  io.emit("expense-deleted", id);
  res.json({ ok: true });
});
