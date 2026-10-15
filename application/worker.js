// Cloud-Based Student Task Manager
// Cloudflare Worker + Workers KV (binding: TASKS_KV)
// API:  POST/GET /api/tasks    GET/PUT/DELETE /api/tasks/{id}
// UI:   GET /

const STATUSES = ["Pending", "In Progress", "Completed"];
const PREFIX = "task:";
const COUNTER_KEY = "meta:counter";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const error = (message, status) => json({ error: message }, status);

function validate(body, { partial = false } = {}) {
  if (typeof body !== "object" || body === null) return "Body must be a JSON object";
  const out = {};
  if (!partial || "title" in body) {
    if (typeof body.title !== "string" || !body.title.trim()) return "title is required";
    if (body.title.length > 100) return "title must be 100 characters or fewer";
    out.title = body.title.trim();
  }
  if ("description" in body) {
    if (typeof body.description !== "string") return "description must be a string";
    if (body.description.length > 500) return "description must be 500 characters or fewer";
    out.description = body.description.trim();
  }
  if ("status" in body) {
    if (!STATUSES.includes(body.status)) return "status must be one of: " + STATUSES.join(", ");
    out.status = body.status;
  }
  return { value: out };
}

async function nextId(env) {
  // Note: KV is eventually consistent, so this counter is fine for a demo
  // but not safe under heavy concurrent writes.
  const current = parseInt((await env.TASKS_KV.get(COUNTER_KEY)) || "100", 10);
  const next = current + 1;
  await env.TASKS_KV.put(COUNTER_KEY, String(next));
  return "T" + next;
}

async function listTasks(env) {
  const tasks = [];
  let cursor;
  do {
    const page = await env.TASKS_KV.list({ prefix: PREFIX, cursor });
    const items = await Promise.all(
      page.keys.map((k) => env.TASKS_KV.get(k.name, "json"))
    );
    tasks.push(...items.filter(Boolean));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return tasks;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function handleApi(request, env, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api","tasks",id?]
  const id = parts[2];
  const method = request.method;

  if (parts[1] !== "tasks" || parts.length > 3) return error("Not found", 404);

  // Collection: /api/tasks
  if (!id) {
    if (method === "GET") return json(await listTasks(env));
    if (method === "POST") {
      const body = await readJson(request);
      const checked = validate(body);
      if (typeof checked === "string") return error(checked, 400);
      const now = new Date().toISOString();
      const task = {
        id: await nextId(env),
        title: checked.value.title,
        description: checked.value.description || "",
        status: checked.value.status || "Pending",
        createdAt: now,
        updatedAt: now,
      };
      await env.TASKS_KV.put(PREFIX + task.id, JSON.stringify(task));
      return json(task, 201);
    }
    return error("Method not allowed", 405);
  }

  // Item: /api/tasks/{id}
  const key = PREFIX + id;
  const existing = await env.TASKS_KV.get(key, "json");
  if (!existing) return error("Task " + id + " not found", 404);

  if (method === "GET") return json(existing);

  if (method === "PUT") {
    const body = await readJson(request);
    const checked = validate(body, { partial: true });
    if (typeof checked === "string") return error(checked, 400);
    const updated = {
      ...existing,
      ...checked.value,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await env.TASKS_KV.put(key, JSON.stringify(updated));
    return json(updated);
  }

  if (method === "DELETE") {
    await env.TASKS_KV.delete(key);
    return json({ deleted: id });
  }

  return error("Method not allowed", 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      if (url.pathname === "/" && request.method === "GET") {
        return new Response(PAGE.replace("__ENV__", env.ENVIRONMENT || "unknown"), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      return error("Not found", 404);
    } catch (e) {
      console.error(e);
      return error("Internal error", 500);
    }
  },
};

// ---------------------------------------------------------------------------
// Frontend (HTML + CSS + JS embedded so Terraform uploads a single module).
// The client script avoids backticks and ${} so it can live inside this
// template literal, and uses textContent (not innerHTML) to prevent XSS.
// ---------------------------------------------------------------------------
const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cloud-Based Student Task Manager v2</title>
<style>
  :root { --bg:#f5f7fa; --card:#fff; --text:#1f2933; --muted:#6b7785; --accent:#2563eb; --danger:#dc2626; --border:#e1e6ec; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background:var(--bg); color:var(--text); }
  main { max-width: 860px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { margin: 0 0 4px; font-size: 1.6rem; }
  .sub { color: var(--muted); margin: 0 0 20px; font-size: .9rem; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 20px; }
  form { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
  form .full { grid-column: 1 / -1; }
  input, textarea, select, button { font: inherit; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; }
  textarea { resize: vertical; min-height: 60px; }
  button { cursor: pointer; background: var(--accent); color: #fff; border-color: var(--accent); }
  button.danger { background: var(--danger); border-color: var(--danger); }
  button.ghost { background: transparent; color: var(--text); border-color: var(--border); }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
  .desc { color: var(--muted); font-size: .85rem; }
  .empty, .msg { color: var(--muted); padding: 12px 0; }
  .msg.err { color: var(--danger); }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; }
  @media (max-width: 600px) { form { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
  <h1>Cloud-Based Student Task Manager</h1>
  <p class="sub">Cloudflare Workers + Workers KV, deployed with Terraform &middot; environment: __ENV__</p>

  <div class="card">
    <form id="task-form">
      <input class="full" id="title" placeholder="Task title" maxlength="100" required>
      <textarea class="full" id="description" placeholder="Description (optional)" maxlength="500"></textarea>
      <select id="status">
        <option>Pending</option>
        <option>In Progress</option>
        <option>Completed</option>
      </select>
      <button type="submit">Add task</button>
    </form>
    <div id="message" class="msg" role="status"></div>
  </div>

  <div class="card table-wrap">
    <table>
      <thead><tr><th>ID</th><th>Task</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody id="tbody"></tbody>
    </table>
    <div id="empty" class="empty" hidden>No tasks yet. Add one above.</div>
  </div>
</main>

<script>
  var STATUSES = ["Pending", "In Progress", "Completed"];
  var tbody = document.getElementById("tbody");
  var emptyEl = document.getElementById("empty");
  var msg = document.getElementById("message");

  function show(text, isError) {
    msg.textContent = text || "";
    msg.className = "msg" + (isError ? " err" : "");
  }

  async function api(path, options) {
    var res = await fetch(path, options);
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  function el(tag, text, cls) {
    var e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  function render(tasks) {
    tbody.replaceChildren();
    emptyEl.hidden = tasks.length > 0;
    tasks.forEach(function (t) {
      var tr = document.createElement("tr");

      tr.appendChild(el("td", t.id));

      var tdTask = document.createElement("td");
      tdTask.appendChild(el("div", t.title));
      if (t.description) tdTask.appendChild(el("div", t.description, "desc"));
      tr.appendChild(tdTask);

      var tdStatus = document.createElement("td");
      var select = document.createElement("select");
      STATUSES.forEach(function (s) {
        var o = el("option", s);
        if (s === t.status) o.selected = true;
        select.appendChild(o);
      });
      select.addEventListener("change", function () { update(t.id, select.value); });
      tdStatus.appendChild(select);
      tr.appendChild(tdStatus);

      var tdActions = el("td", undefined, "actions");
      var del = el("button", "Delete", "danger");
      del.addEventListener("click", function () { remove(t.id); });
      tdActions.appendChild(del);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    });
  }

  async function load() {
    try { render(await api("/api/tasks")); }
    catch (e) { show(e.message, true); }
  }

  async function update(id, status) {
    try {
      await api("/api/tasks/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: status })
      });
      show("Task " + id + " updated.");
      load();
    } catch (e) { show(e.message, true); }
  }

  async function remove(id) {
    if (!confirm("Delete task " + id + "?")) return;
    try {
      await api("/api/tasks/" + id, { method: "DELETE" });
      show("Task " + id + " deleted.");
      load();
    } catch (e) { show(e.message, true); }
  }

  document.getElementById("task-form").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    try {
      var task = await api("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: document.getElementById("title").value,
          description: document.getElementById("description").value,
          status: document.getElementById("status").value
        })
      });
      show("Task " + task.id + " created.");
      ev.target.reset();
      load();
    } catch (e) { show(e.message, true); }
  });

  load();
</script>
</body>
</html>`;
