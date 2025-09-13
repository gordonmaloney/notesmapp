// src/pages/Admin.jsx
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";

const API_BASE = import.meta.env?.VITE_API_BASE || "";

export default function Admin() {
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [me, setMe] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/me`, {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setMe(data);
        return true;
      }
      setMe(null);
      return false;
    } catch {
      setMe(null);
      return false;
    }
  }, []);

  const fetchDocs = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/docs`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDocs(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(String(e.message || e));
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const authed = await fetchMe();
      if (authed) fetchDocs();
    })();
  }, [fetchMe, fetchDocs]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const url = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      console.log("Calling:", `${API_BASE}${url}`);
      const res = await fetch(`${API_BASE}${url}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setUsername("");
      setPassword("");
      setMe(
        data.user ||
          (await (
            await fetch(`${API_BASE}/api/me`, { credentials: "include" })
          ).json())
      );
      fetchDocs();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const onLogout = async () => {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setMe(null);
    setDocs([]);
  };

  // --- Rename helpers ---
  const startEdit = (doc) => {
    setEditingId(doc.id);
    setEditingName(doc.name || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const commitEdit = async () => {
    const id = editingId;
    const name = (editingName || "").trim();
    if (!id) return;
    if (!name) {
      cancelEdit();
      return;
    }
    // optimistic UI
    setDocs((ds) => ds.map((d) => (d.id === id ? { ...d, name } : d)));
    cancelEdit();
    try {
      const res = await fetch(
        `${API_BASE}/api/doc/${encodeURIComponent(id)}/name`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // no-op; UI already updated
    } catch (e) {
      // On error, refetch
      fetchDocs();
      alert("Rename failed.");
    }
  };

  const onEditKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  const createDoc = async () => {
    const defaultName = "Untitled map";
    const name = window.prompt("Name your new map:", defaultName);
    if (name === null) return; // cancelled
    const clean = name.trim();
    if (!clean) return;

    const id = uuidv4(); // generate a new unique id

    const snapshot = {
      name: clean,
      meta: { title: clean },
      // Add other empty/default fields your editor expects
      data: {},
    };

    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/doc/${encodeURIComponent(id)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Locally add the new doc to the list
      const newDoc = { id, name: clean, updatedAt: Date.now() };
      setDocs((ds) => [newDoc, ...ds]);

      // Optionally navigate right into it
      navigate(`/${encodeURIComponent(clean)}`);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const [cloneBusy, setCloneBusy] = useState(null);

  const cloneDoc = async (doc) => {
    // doc = { id, name, updatedAt } (from your list)
    const defaultName = `${doc.name || "Untitled"} (copy)`;
    const newName = window.prompt("Name for the cloned map:", defaultName);
    if (newName === null) return; // cancelled
    const cleanName = newName.trim();
    if (!cleanName) return;

    setCloneBusy(doc.id);
    setErr("");
    try {
      // 1) Fetch full snapshot by NAME
      const fullRes = await fetch(
        `${API_BASE}/api/doc/${encodeURIComponent(doc.name)}`,
        { credentials: "include", cache: "no-store" }
      );
      if (!fullRes.ok)
        throw new Error(`Fetch source failed (HTTP ${fullRes.status})`);
      const source = await fullRes.json();

      if (!source) throw new Error("Source not found");

      // 2) Build new snapshot
      // Make a deep clone so we don't mutate the original.
      // Prefer structuredClone if available; fallback to JSON copy.
      const deep = (obj) =>
        typeof structuredClone === "function"
          ? structuredClone(obj)
          : JSON.parse(JSON.stringify(obj));

      const snapshot = deep(source.snapshot);





      // 2a) Clean server-managed/identity fields if present
      // (depends on your schema; keep this defensive)
      delete snapshot.id;
      delete snapshot._id;
      delete snapshot.ownerId;
      delete snapshot.createdAt;
      delete snapshot.updatedAt;
      // If you keep slugs or derived fields, reset them so the server can regenerate
      if ("slug" in snapshot) delete snapshot.slug;

      // 2b) Update naming fields your editor/server use
      snapshot.name = cleanName;
      snapshot.meta = {
        ...(snapshot.meta || {}),
        title: cleanName,
      };

      // 3) Create new id and PUT (upsert)
      const newId = uuidv4();
      const putRes = await fetch(
        `${API_BASE}/api/doc/${encodeURIComponent(newId)}`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
        }
      );
      if (!putRes.ok)
        throw new Error(`Clone write failed (HTTP ${putRes.status})`);

      // 4) Update UI (prepend new summary)
      const newDocSummary = {
        id: newId,
        name: cleanName,
        updatedAt: Date.now(),
      };
      setDocs((ds) => [newDocSummary, ...ds]);

      // 5) (Optional) navigate right into the clone by name
      // navigate(`/${encodeURIComponent(cleanName)}`);
    } catch (e) {
      console.error(e);
      alert("Clone failed: " + (e.message || e));
    } finally {
      setCloneBusy(null);
    }
  };


  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 16 }}>
      <h1>Admin</h1>

      {!me ? (
        <form
          onSubmit={onSubmit}
          style={{ display: "grid", gap: 8, maxWidth: 360 }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setMode("login")}
              style={{ fontWeight: mode === "login" ? 700 : 400 }}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              style={{ fontWeight: mode === "signup" ? 700 : 400 }}
            >
              Sign up
            </button>
          </div>

          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          <input
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            required
            minLength={8}
          />
          <button type="submit" disabled={loading}>
            {loading ? "…" : mode === "signup" ? "Create account" : "Log in"}
          </button>
          {err && <div style={{ color: "red" }}>{err}</div>}
        </form>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600 }}>{me.name || me.username}</div>
            {me.email && (
              <div style={{ fontSize: 12, opacity: 0.7 }}>{me.email}</div>
            )}
          </div>

          <button onClick={onLogout} style={{ marginLeft: "auto" }}>
            Log out
          </button>
        </div>
      )}

      <h2 style={{ marginTop: 24 }}>Your maps</h2>

      {loading && <p>Loading…</p>}

      {me && (
        <button onClick={createDoc} disabled={loading}>
          {loading ? "Working…" : "Create"}
        </button>
      )}

      {!loading &&
        me &&
        (docs.length ? (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {docs.map((d) => (
              <li
                key={d.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 0",
                  borderBottom: "1px solid #eee",
                }}
              >
                {/* Name area (inline edit) */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === d.id ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={onEditKeyDown}
                      onBlur={commitEdit}
                      maxLength={120}
                      style={{ width: "100%", fontWeight: 600 }}
                      placeholder="Map name"
                    />
                  ) : (
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <Link
                        to={`/${encodeURIComponent(d.name)}`}
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        <div
                          style={{
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                            overflow: "hidden",
                          }}
                        >
                          {d.name}
                        </div>
                      </Link>
                      <button onClick={() => startEdit(d)} title="Rename">
                        Rename
                      </button>

                      <button
                        onClick={() =>cloneDoc(d)}
                        title="Clone"
                        disabled={cloneBusy === d.id}
                      >
                        {cloneBusy === d.id ? "Cloning…" : "Clone"}
                      </button>

                      <button
                        onClick={async () => {
                          if (
                            !window.confirm(`Delete map "${d.name || d.id}"?`)
                          )
                            return;
                          try {
                            const res = await fetch(
                              `${API_BASE}/api/doc/${encodeURIComponent(d.id)}`,
                              {
                                method: "DELETE",
                                credentials: "include",
                              }
                            );
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            // Optimistically remove from UI
                            setDocs((ds) =>
                              ds.filter((doc) => doc.id !== d.id)
                            );
                          } catch (e) {
                            alert("Delete failed: " + e.message);
                          }
                        }}
                        title="Delete"
                        style={{ color: "red" }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Updated {new Date(d.updatedAt).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>No maps yet.</p>
        ))}
    </div>
  );
}
