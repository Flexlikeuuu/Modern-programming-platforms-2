import React, { useMemo, useState } from "react";
import { api, saveSession } from "./api.js";

const DEMO = [
  { role: "Админ", email: "admin@hotel.local", password: "Admin12345" },
  { role: "Менеджер", email: "manager@hotel.local", password: "Manager12345" },
  { role: "Гость", email: "guest@hotel.local", password: "Guest12345" },
];

export default function AuthPage({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(
    () => (mode === "register" ? "Создать аккаунт" : "Вход в систему"),
    [mode],
  );

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        const data = await api("/api/auth/login", {
          method: "POST",
          json: { email, password },
        });
        saveSession(data);
        onAuthed(data.user);
        return;
      }
      const data = await api("/api/auth/register", {
        method: "POST",
        json: { email, password, name },
      });
      saveSession(data);
      onAuthed(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <section className="auth-brand">
          <div className="hero-badge">Hotel Booking System</div>
          <h1>Бронирование гостиничных номеров</h1>
          <p>
            Три роли доступа на временных ключах: гость бронирует, менеджер ведёт каталог,
            администратор управляет системой.
          </p>
          <ul className="auth-points">
            <li>JWT-ключи с ограниченным сроком жизни</li>
            <li>Защита от подбора пароля и лимит сессий</li>
          </ul>
        </section>

        <section className="auth-card">
          <div className="auth-tabs">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => setMode("login")}
            >
              Вход
            </button>
            <button
              type="button"
              className={mode === "register" ? "active" : ""}
              onClick={() => setMode("register")}
            >
              Регистрация
            </button>
          </div>

          <h2>{title}</h2>

          {error && <div className="auth-alert auth-alert-error">{error}</div>}

          <form onSubmit={submit}>
            {mode === "register" && (
              <div className="form-group">
                <label htmlFor="name">Имя</label>
                <input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Анна Иванова"
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Пароль</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "register" ? "Не менее 8 символов" : "••••••••"}
                required
                minLength={mode === "register" ? 8 : undefined}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>

            <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
              {busy
                ? "Подождите…"
                : mode === "login"
                  ? "Войти"
                  : "Зарегистрироваться"}
            </button>
          </form>

          {mode === "login" && (
            <div className="demo-box">
              <div className="demo-title">Демо-аккаунты</div>
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  className="demo-row"
                  onClick={() => {
                    setEmail(d.email);
                    setPassword(d.password);
                  }}
                >
                  <span>{d.role}</span>
                  <code>{d.email}</code>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
