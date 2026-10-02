import React, { useMemo, useState } from "react";
import { api, saveSession } from "./api.js";

const DEMO = [
  { role: "Админ", email: "admin@hotel.local", password: "Admin12345" },
  { role: "Менеджер", email: "manager@hotel.local", password: "Manager12345" },
  { role: "Гость", email: "guest@hotel.local", password: "Guest12345" },
];

export default function AuthPage({ onAuthed }) {
  const [mode, setMode] = useState("login"); // "login" | "register" | "forgot" | "reset"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const title = useMemo(() => {
    switch (mode) {
      case "register":
        return "Создать аккаунт";
      case "forgot":
        return "Восстановление доступа";
      case "reset":
        return "Установка нового пароля";
      default:
        return "Вход в систему";
    }
  }, [mode]);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setSuccessMsg("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
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

      if (mode === "register") {
        const data = await api("/api/auth/register", {
          method: "POST",
          json: { email, password, name },
        });
        saveSession(data);
        onAuthed(data.user);
        return;
      }

      if (mode === "forgot") {
        const data = await api("/api/auth/forgot-password", {
          method: "POST",
          json: { email },
        });
        setSuccessMsg(
          data.message ||
            "Инструкции по восстановлению пароля отправлены на ваш email.",
        );
        if (data.devResetToken) {
          setResetToken(data.devResetToken);
        }
        setMode("reset");
        return;
      }

      if (mode === "reset") {
        const data = await api("/api/auth/reset-password", {
          method: "POST",
          json: { token: resetToken, newPassword },
        });
        setSuccessMsg(data.message || "Пароль успешно обновлён!");
        setPassword("");
        setNewPassword("");
        setResetToken("");
        setMode("login");
        return;
      }
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
        </section>

        <section className="auth-card">
          {(mode === "login" || mode === "register") ? (
            <div className="auth-tabs">
              <button
                type="button"
                className={mode === "login" ? "active" : ""}
                onClick={() => switchMode("login")}
              >
                Вход
              </button>
              <button
                type="button"
                className={mode === "register" ? "active" : ""}
                onClick={() => switchMode("register")}
              >
                Регистрация
              </button>
            </div>
          ) : (
            <div className="auth-tabs">
              <button
                type="button"
                className="active"
                onClick={() => switchMode("login")}
              >
                ← Вернуться ко входу
              </button>
            </div>
          )}

          <h2>{title}</h2>

          {error && <div className="auth-alert auth-alert-error">{error}</div>}
          {successMsg && <div className="auth-alert auth-alert-ok">{successMsg}</div>}

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

            {(mode === "login" || mode === "register" || mode === "forgot") && (
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
            )}

            {(mode === "login" || mode === "register") && (
              <div className="form-group">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label htmlFor="password">Пароль</label>
                  {mode === "login" && (
                    <button
                      type="button"
                      className="auth-link"
                      style={{ width: "auto", margin: 0, padding: 0, fontSize: "0.85rem" }}
                      onClick={() => switchMode("forgot")}
                    >
                      Забыли пароль?
                    </button>
                  )}
                </div>
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
            )}

            {mode === "reset" && (
              <>
                <div className="form-group">
                  <label htmlFor="resetToken">Временный ключ из письма</label>
                  <input
                    id="resetToken"
                    type="text"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Вставьте полученный ключ"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="newPassword">Новый пароль</label>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Минимум 8 символов"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
              </>
            )}

            <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
              {busy
                ? "Подождите…"
                : mode === "login"
                  ? "Войти"
                  : mode === "register"
                    ? "Зарегистрироваться"
                    : mode === "forgot"
                      ? "Отправить ключ восстановления"
                      : "Сохранить новый пароль"}
            </button>

            {mode === "forgot" && (
              <button
                type="button"
                className="auth-link"
                style={{ marginTop: "1rem", fontSize: "0.9rem" }}
                onClick={() => switchMode("reset")}
              >
                Уже есть ключ? Ввести новый пароль
              </button>
            )}
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
