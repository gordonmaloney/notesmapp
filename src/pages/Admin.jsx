// src/pages/Admin.jsx
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";

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
                        to={`/${encodeURIComponent(d.id)}`}
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
                          {d.id}
                        </div>
                      </Link>
                      <button onClick={() => startEdit(d)} title="Rename">
                        Rename
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
