// backend/server.js
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { createServer } from "http";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import calendarRoutes from "./routes/calendar.js";

dotenv.config();

/* ------------------------------------------------ */
/*                    PATH UTILS                    */
/* ------------------------------------------------ */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ------------------------------------------------ */
/*                  EXPRESS INIT                    */
/* ------------------------------------------------ */

const app = express();

/* ------------------------------------------------ */
/*                    CORS FIX                      */
/* ------------------------------------------------ */

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://intranet.nicojoel-etchegaray.workers.dev",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// FIX para Cloudflare fetch preflight
app.options(/\/calendar(\/.*)?$/, cors());

app.use(express.json());

/* ------------------------------------------------ */
/*             HTTP SERVER + SOCKET.IO              */
/* ------------------------------------------------ */

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:5173",
      "https://intranet.nicojoel-etchegaray.workers.dev",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

/* ------------------------------------------------ */
/*                MONGODB CONNECTION                */
/* ------------------------------------------------ */

const client = new MongoClient(process.env.MONGO_URI);
let db = null;

/* ------------------------------------------------ */
/*               GOOGLE CALENDAR ROUTES             */
/* ------------------------------------------------ */

app.use("/calendar", calendarRoutes);

/* ------------------------------------------------ */
/*           SOCKET.IO ONLINE USERS + BEATS         */
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

  socket.on("heartbeat", async (username) => {
    if (onlineUsers.has(socket.id)) {
      const data = onlineUsers.get(socket.id);
      data.lastBeat = Date.now();
      onlineUsers.set(socket.id, data);
    }
    await updateLastSeen(username);
  });

  socket.on("force-disconnect", async (username) => {
    console.log("⚠️ Force disconnect:", username);
    await updateLastSeen(username);

    for (const [id, data] of onlineUsers.entries()) {
      if (data.username === username) onlineUsers.delete(id);
    }

    broadcastUserStatus();
  });

  socket.on("disconnect", async () => {
    const u = onlineUsers.get(socket.id);
    if (u) {
      await updateLastSeen(u.username);
      onlineUsers.delete(socket.id);
    }
    broadcastUserStatus();
    console.log("❌ Cliente desconectado:", socket.id);
  });

  // Broadcast en tiempo real
  socket.on("client-updated", (client) => io.emit("client-updated", client));
  socket.on("client-deleted", (id) => io.emit("client-deleted", id));

  socket.on("task-updated", (task) => io.emit("task-updated", task));
  socket.on("task-deleted", (id) => io.emit("task-deleted", id));

  socket.on("activity-updated", (log) => io.emit("activity-updated", log));

  socket.on("expense-updated", (exp) => io.emit("expense-updated", exp));
  socket.on("expense-deleted", (id) => io.emit("expense-deleted", id));

  socket.on("job-updated", (job) => io.emit("job-updated", job));
  socket.on("job-deleted", (id) => io.emit("job-deleted", id));
});

/* ------------------------------------------------ */
/*              HEARTBEAT AUTO CLEANUP              */
/* ------------------------------------------------ */

setInterval(async () => {
  const now = Date.now();

  for (const [socketId, data] of onlineUsers.entries()) {
    if (now - data.lastBeat > 12000) {
      await updateLastSeen(data.username);
      onlineUsers.delete(socketId);
    }
  }

  broadcastUserStatus();
}, 4000);

/* ------------------------------------------------ */
/*                  HEALTHCHECK                     */
/* ------------------------------------------------ */

app.get("/", (req, res) => {
  res.json({ ok: true, msg: "🔥 CRM Backend funcionando" });
});

/* ------------------------------------------------ */
/*                    HELPERS                       */
/* ------------------------------------------------ */

function cleanHTML(text) {
  return text.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

function normalizeID(obj) {
  return { ...obj, id: obj._id?.toString(), _id: undefined };
}

/* ------------------------------------------------ */
/*                  CRUD: CLIENTS                   */
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
  await db.collection("clients").updateOne({ _id: new ObjectId(id) }, { $set: req.body });
  const updated = await db.collection("clients").findOne({ _id: new ObjectId(id) });
  io.emit("client-updated", normalizeID(updated));
  res.json(normalizeID(updated));
});

app.delete("/clients/:id", async (req, res) => {
  const id = req.params.id;
  await db.collection("clients").deleteOne({ _id: new ObjectId(id) });
  io.emit("client-deleted", id);
  res.json({ ok: true });
});

/* ------------------------------------------------ */
/*                  CRUD: ACTIVITIES                */
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
  io.emit("activity-updated", normalizeID({ ...log, _id: result.insertedId }));
  res.json(normalizeID({ ...log, _id: result.insertedId }));
});

/* ------------------------------------------------ */
/*                     CRUD: TASKS                  */
/* ------------------------------------------------ */

app.get("/tasks", async (req, res) => {
  const list = await db.collection("tasks").find().toArray();
  res.json(list.map(normalizeID));
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
  await db.collection("tasks").updateOne({ _id: new ObjectId(id) }, { $set: req.body });
  const updated = await db.collection("tasks").findOne({ _id: new ObjectId(id) });
  io.emit("task-updated", normalizeID(updated));
  res.json(normalizeID(updated));
});

app.delete("/tasks/:id", async (req, res) => {
  const id = req.params.id;
  await db.collection("tasks").deleteOne({ _id: new ObjectId(id) });
  io.emit("task-deleted", id);
  res.json({ ok: true });
});

/* ------------------------------------------------ */
/*                   CRUD: EXPENSES                 */
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

/* ------------------------------------------------ */
/*                    CRUD: JOBS                    */
/* ------------------------------------------------ */

app.get("/jobs", async (req, res) => {
  const list = await db.collection("jobs").find().toArray();
  res.json(list.map(normalizeID));
});

app.post("/jobs", async (req, res) => {
  const job = {
    clientId: req.body.clientId,
    title: req.body.title,
    description: req.body.description || "",
    status: req.body.status || "nuevo",
    budget: Number(req.body.budget) || 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const result = await db.collection("jobs").insertOne(job);
  const full = normalizeID({ ...job, _id: result.insertedId });

  io.emit("job-updated", full);
  res.json(full);
});

app.put("/jobs/:id", async (req, res) => {
  const id = req.params.id;

  const updateData = {
    ...req.body,
    budget: Number(req.body.budget) || 0,
    updatedAt: new Date().toISOString(),
  };

  await db.collection("jobs").updateOne({ _id: new ObjectId(id) }, { $set: updateData });

  const updated = await db.collection("jobs").findOne({ _id: new ObjectId(id) });
  const full = normalizeID(updated);

  io.emit("job-updated", full);
  res.json(full);
});

app.delete("/jobs/:id", async (req, res) => {
  const id = req.params.id;
  await db.collection("jobs").deleteOne({ _id: new ObjectId(id) });
  io.emit("job-deleted", id);
  res.json({ ok: true });
});

/* ------------------------------------------------ */
/*                   START SERVER                   */
/* ------------------------------------------------ */

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

export { io };
