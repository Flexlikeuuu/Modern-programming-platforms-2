import React, { useEffect, useMemo, useState } from "react";
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
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    const handleUrlToken = () => {
      const hash = window.location.hash || "";
      const searchParams = new URLSearchParams(window.location.search);
      let tokenFromUrl = searchParams.get("token") || searchParams.get("reset-token");

      if (!tokenFromUrl && hash.includes("reset-token=")) {
        const match = hash.match(/reset-token=([^&]+)/);
        if (match) tokenFromUrl = decodeURIComponent(match[1]);
      }
      if (!tokenFromUrl && hash.includes("token=")) {
        const match = hash.match(/token=([^&]+)/);
        if (match) tokenFromUrl = decodeURIComponent(match[1]);
      }

      if (tokenFromUrl) {
        setResetToken(tokenFromUrl);
        setMode("reset");
        setError("");
        setSuccessMsg("Ссылка подтверждена. Задайте новый пароль для учетной записи.");
      }
    };

    handleUrlToken();
    window.addEventListener("hashchange", handleUrlToken);
    return () => window.removeEventListener("hashchange", handleUrlToken);
  }, []);

  const title = useMemo(() => {
    if (mode === "register") return "Создать аккаунт";
    if (mode === "forgot") return "Восстановление доступа";
    if (mode === "reset") return "Установка нового пароля";
    return "Вход в систему";
  }, [mode]);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setSuccessMsg("");
    setPreviewUrl("");
    setForgotSent(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setPreviewUrl("");
    setBusy(true);

    try {
      if (mode === "login" || mode === "register") {
        const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
        const json = mode === "login" ? { email, password } : { email, password, name };
        const data = await api(path, { method: "POST", json });
        saveSession(data);
        onAuthed(data.user);
        return;
      }

      if (mode === "forgot") {
        const data = await api("/api/auth/forgot-password", {
          method: "POST",
          json: { email },
        });
        setForgotSent(true);
        setSuccessMsg(
          data.message ||
            "Ссылка для сброса пароля отправлена на ваш email! Проверьте входящие сообщения и перейдите по ссылке.",
        );
        if (data.previewUrl) setPreviewUrl(data.previewUrl);
        return;
      }

      if (mode === "reset") {
        if (!resetToken) {
          setError("Отсутствует ключ восстановления пароля.");
          return;
        }
        if (newPassword.length < 8) {
          setError("Новый пароль должен содержать минимум 8 символов.");
          return;
        }
        if (newPassword !== confirmPassword) {
          setError("Введённые пароли не совпадают.");
          return;
        }

        const data = await api("/api/auth/reset-password", {
          method: "POST",
          json: { token: resetToken, newPassword },
        });

        window.location.hash = "";
        window.history.replaceState(null, "", window.location.pathname);
        setPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setResetToken("");
        setPreviewUrl("");
        setForgotSent(false);
        setMode("login");
        setSuccessMsg(data.message || "Пароль успешно обновлён в базе данных! Войдите с новым паролем.");
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
          {mode === "login" || mode === "register" ? (
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
              <button type="button" className="active" onClick={() => switchMode("login")}>
                ← Вернуться ко входу
              </button>
            </div>
          )}

          <h2>{title}</h2>

          {error && <div className="auth-alert auth-alert-error">{error}</div>}
          {successMsg && <div className="auth-alert auth-alert-ok">{successMsg}</div>}

          {previewUrl && (
            <div style={{ marginBottom: "1rem" }}>
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                style={{
                  display: "block",
                  textAlign: "center",
                  textDecoration: "none",
                  fontSize: "0.88rem",
                  padding: "0.6rem 1rem",
                }}
              >
                ✉️ Открыть отправленное письмо (Ethereal Web Preview)
              </a>
            </div>
          )}

          {mode === "forgot" && forgotSent ? (
            <div style={{ textAlign: "center", marginTop: "1rem" }}>
              <div
                style={{
                  padding: "1.25rem",
                  background: "var(--card-subtle, #f8fafc)",
                  borderRadius: "8px",
                  border: "1px solid var(--border, #e2e8f0)",
                  marginBottom: "1.25rem",
                }}
              >
                <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📧</div>
                <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
                  Проверьте ваш почтовый ящик
                </div>
                <p style={{ fontSize: "0.9rem", color: "var(--muted, #64748b)", margin: 0 }}>
                  Мы выслали ссылку для смены пароля на <strong>{email}</strong>. Перейдите по ссылке из письма, чтобы задать новый пароль.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: "100%", marginBottom: "0.75rem" }}
                onClick={() => setForgotSent(false)}
              >
                Отправить на другой email
              </button>

              <button
                type="button"
                className="auth-link"
                style={{ fontSize: "0.88rem" }}
                onClick={() => switchMode("reset")}
              >
                Уже скопировали ключ из письма? Ввести ключ вручную
              </button>
            </div>
          ) : (
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

              {mode === "forgot" && (
                <p style={{ fontSize: "0.85rem", color: "var(--muted, #64748b)", marginTop: "-0.25rem", marginBottom: "1rem" }}>
                  На указанную почту придёт письмо со ссылкой для ввода нового пароля.
                </p>
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
                  {!resetToken ? (
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
                  ) : (
                    <div
                      style={{
                        padding: "0.6rem 0.8rem",
                        background: "rgba(37, 99, 235, 0.08)",
                        borderRadius: "6px",
                        marginBottom: "1rem",
                        fontSize: "0.85rem",
                        color: "#2563eb",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>🔑 Ключ подтверждения активирован</span>
                      <button
                        type="button"
                        className="auth-link"
                        style={{ width: "auto", margin: 0, padding: 0, fontSize: "0.8rem" }}
                        onClick={() => setResetToken("")}
                      >
                        Изменить
                      </button>
                    </div>
                  )}

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

                  <div className="form-group">
                    <label htmlFor="confirmPassword">Повторите новый пароль</label>
                    <input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Повторите новый пароль"
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
                        ? "Отправить ссылку на почту"
                        : "Сохранить новый пароль"}
              </button>

              {mode === "forgot" && (
                <button
                  type="button"
                  className="auth-link"
                  style={{ marginTop: "1rem", fontSize: "0.9rem" }}
                  onClick={() => switchMode("reset")}
                >
                  Уже есть ключ из письма? Ввести новый пароль
                </button>
              )}
            </form>
          )}

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
