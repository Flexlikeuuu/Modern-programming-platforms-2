import React, { useState, useEffect, useRef, useMemo } from "react";
import "./App.css";
import AuthPage from "./AuthPage.jsx";
import { api, clearSession, getStoredUser, getToken } from "./api.js";

const ROLE_LABEL = {
  guest: "Гость",
  manager: "Менеджер",
  admin: "Администратор",
};

export default function App() {
  const [user, setUser] = useState(() => (getToken() ? getStoredUser() : null));
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [sessions, setSessions] = useState([]);

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [existingImageUrl, setExistingImageUrl] = useState("");
  const [imageInputKey, setImageInputKey] = useState(0);

  const formRef = useRef(null);
  const canManage = user?.role === "manager" || user?.role === "admin";
  const canDelete = user?.role === "admin";

  const editingRoom = useMemo(
    () => rooms.find((r) => Number(r.id) === Number(editingId)) ?? null,
    [rooms, editingId],
  );

  const [newImagePreview, setNewImagePreview] = useState(null);

  useEffect(() => {
    if (!imageFile) {
      setNewImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setNewImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const previewImageSrc = newImagePreview ?? (existingImageUrl || null);

  const showError = (msg) => {
    setError(msg);
    setTimeout(() => setError(""), 4000);
  };

  const showSuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const fetchRooms = async () => {
    try {
      const data = await api("/api/rooms");
      setRooms(data);
    } catch (err) {
      if (err.status === 401) {
        setUser(null);
        return;
      }
      showError(err.message);
    }
  };

  const fetchSessions = async () => {
    try {
      const data = await api("/api/auth/sessions");
      setSessions(data.sessions);
    } catch {}
  };

  useEffect(() => {
    if (!user) return;
    fetchRooms();
    fetchSessions();
  }, [user]);

  const resetForm = () => {
    setTitle("");
    setPrice("");
    setDescription("");
    setImageFile(null);
    setExistingImageUrl("");
    setEditingId(null);
    setImageInputKey((k) => k + 1);
  };

  const buildFormData = (isBooked) => {
    const formData = new FormData();
    formData.append("title", title.trim());
    formData.append("price", price);
    formData.append("description", description);
    if (isBooked !== undefined) formData.append("is_booked", String(isBooked));
    if (imageFile) formData.append("image", imageFile);
    return formData;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      if (editingId) {
        const data = await api(`/api/rooms/${editingId}`, {
          method: "PUT",
          body: buildFormData(editingRoom?.is_booked ?? false),
        });
        setRooms(rooms.map((r) => (Number(r.id) === Number(editingId) ? data : r)));
        showSuccess("Номер успешно обновлён");
        resetForm();
      } else {
        const data = await api("/api/rooms", {
          method: "POST",
          body: buildFormData(),
        });
        setRooms([data, ...rooms]);
        showSuccess("Номер успешно добавлен");
        resetForm();
      }
    } catch (err) {
      showError(err.message);
    }
  };

  const toggleBook = async (room) => {
    try {
      const data = await api(`/api/rooms/${room.id}/book`, {
        method: "PATCH",
        json: { is_booked: !room.is_booked },
      });
      setRooms(rooms.map((r) => (Number(r.id) === Number(room.id) ? data : r)));
      showSuccess(room.is_booked ? "Бронь снята" : "Номер забронирован");
    } catch (err) {
      showError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Вы действительно хотите удалить этот номер?")) return;
    try {
      await api(`/api/rooms/${id}`, { method: "DELETE" });
      setRooms(rooms.filter((r) => Number(r.id) !== Number(id)));
      if (Number(editingId) === Number(id)) resetForm();
      showSuccess("Номер удалён");
    } catch (err) {
      showError(err.message);
    }
  };

  const startEdit = (room) => {
    setEditingId(Number(room.id));
    setTitle(room.title || "");
    setPrice(room.price != null ? String(room.price) : "");
    setDescription(room.description || "");
    setImageFile(null);
    setExistingImageUrl(room.image_url || "");
    setImageInputKey((k) => k + 1);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const logout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {}
    clearSession();
    setUser(null);
    setRooms([]);
  };

  const revokeSession = async (id) => {
    try {
      await api(`/api/auth/sessions/${id}`, { method: "DELETE" });
      await fetchSessions();
      showSuccess("Сессия отозвана");
    } catch (err) {
      showError(err.message);
    }
  };

  const logoutAll = async () => {
    try {
      await api("/api/auth/logout-all", { method: "POST" });
    } catch {}
    clearSession();
    setUser(null);
  };

  const availableCount = rooms.filter((r) => !r.is_booked).length;
  const bookedCount = rooms.filter((r) => r.is_booked).length;

  if (!user) {
    return (
      <>
        <div className="toast-container">
          {error && <div className="toast toast-error">{error}</div>}
        </div>
        <AuthPage onAuthed={setUser} />
      </>
    );
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-inner">
          <div className="hero-top">
            <div className="hero-badge">Hotel Booking System</div>
            <div className="user-chip">
              <div>
                <div className="user-name">{user.name}</div>
                <div className="user-role">{ROLE_LABEL[user.role] || user.role}</div>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={logout}>
                Выйти
              </button>
            </div>
          </div>
          <h1>
            Бронирование
            <br />
            гостиничных номеров
          </h1>
          <p className="hero-subtitle">
            Управляйте каталогом номеров, ценами и статусом бронирования в одном месте
          </p>
          <div className="stats">
            <div className="stat-card">
              <div className="stat-value">{rooms.length}</div>
              <div className="stat-label">Всего номеров</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{availableCount}</div>
              <div className="stat-label">Свободно</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{bookedCount}</div>
              <div className="stat-label">Забронировано</div>
            </div>
          </div>
        </div>
      </header>

      <div className="toast-container">
        {error && <div className="toast toast-error">{error}</div>}
        {success && <div className="toast toast-success">{success}</div>}
      </div>

      <main className="main">
        <div className={`layout${canManage ? "" : " layout--guest"}`}>
          {canManage && (
            <aside ref={formRef} className={`form-panel${editingId ? " form-panel--editing" : ""}`}>
              <h2>{editingId ? "Редактировать номер" : "Новый номер"}</h2>
              {editingId && editingRoom && (
                <p className="form-edit-hint">Редактируется: «{editingRoom.title}»</p>
              )}
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="title">Название</label>
                  <input
                    id="title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Например, Люкс с видом на море"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="price">Цена за ночь (₽)</label>
                  <input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="3500"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="description">Описание</label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Удобства, площадь, особенности..."
                    rows="3"
                  />
                </div>

                <div className="form-group file-input-wrap">
                  <label htmlFor="image">
                    {editingId ? "Новая фотография (необязательно)" : "Фотография"}
                  </label>
                  {previewImageSrc && (
                    <>
                      <span className="image-preview-label">
                        {imageFile ? "Новое фото" : "Текущее фото"}
                      </span>
                      <img src={previewImageSrc} alt="Предпросмотр" className="image-preview" />
                    </>
                  )}
                  <input
                    key={imageInputKey}
                    id="image"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  />
                </div>

                <div className="form-actions">
                  <button type="submit" className="btn btn-primary">
                    {editingId ? "Сохранить" : "Добавить"}
                  </button>
                  {editingId && (
                    <button type="button" className="btn btn-secondary" onClick={resetForm}>
                      Отмена
                    </button>
                  )}
                </div>
              </form>
            </aside>
          )}

          <section>
            <div className="catalog-header">
              <h2>Каталог</h2>
              <span className="catalog-count">
                {rooms.length === 0
                  ? "Пока пусто"
                  : `${rooms.length} ${rooms.length === 1 ? "номер" : rooms.length < 5 ? "номера" : "номеров"}`}
              </span>
            </div>

            <div className="rooms-grid">
              {rooms.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🏨</div>
                  <p>
                    Номера пока не добавлены.
                    <br />
                    {canManage
                      ? "Создайте первый номер в форме слева."
                      : "Дождитесь, пока менеджер добавит номера."}
                  </p>
                </div>
              ) : (
                rooms.map((room) => (
                  <article
                    key={room.id}
                    className={`room-card${room.is_booked ? " booked" : ""}${
                      Number(editingId) === Number(room.id) ? " room-card--editing" : ""
                    }`}
                  >
                    <div className="room-image-wrap">
                      {room.image_url ? (
                        <img src={room.image_url} alt={room.title} />
                      ) : (
                        <div className="room-image-placeholder">Нет фото</div>
                      )}
                      <span
                        className={`status-badge ${
                          room.is_booked ? "status-booked" : "status-available"
                        }`}
                      >
                        {room.is_booked ? "Занят" : "Свободен"}
                      </span>
                    </div>
                    <div className="room-body">
                      <h3 className="room-title">{room.title}</h3>
                      <p className="room-price">
                        {Number(room.price).toLocaleString("ru-RU")} ₽
                        <span> / ночь</span>
                      </p>
                      {room.description && <p className="room-description">{room.description}</p>}
                      <div className="room-actions">
                        <button
                          type="button"
                          className={`btn btn-sm ${room.is_booked ? "btn-unbook" : "btn-book"}`}
                          onClick={() => toggleBook(room)}
                        >
                          {room.is_booked ? "Снять бронь" : "Забронировать"}
                        </button>
                        {canManage && (
                          <button
                            type="button"
                            className="btn btn-sm btn-edit"
                            onClick={() => startEdit(room)}
                          >
                            {Number(editingId) === Number(room.id) ? "Редактируется…" : "Изменить"}
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            className="btn btn-sm btn-delete"
                            onClick={() => handleDelete(room.id)}
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="sessions-panel">
              <div className="catalog-header">
                <h2>Активные подключения</h2>
              </div>
              <ul className="session-list">
                {sessions.map((s) => (
                  <li key={s.id} className={s.current ? "current" : ""}>
                    <div>
                      <strong>{s.current ? "Это устройство" : "Другое устройство"}</strong>
                      <div className="session-meta">
                        {s.ip} · {new Date(s.createdAt).toLocaleString("ru-RU")}
                      </div>
                    </div>
                    {!s.current && (
                      <button
                        type="button"
                        className="btn btn-sm btn-delete"
                        onClick={() => revokeSession(s.id)}
                      >
                        Отозвать
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn-secondary" onClick={logoutAll}>
                Выйти на всех устройствах
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
