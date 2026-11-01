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

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("default");

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

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
    formData.append("is_booked", isBooked);
    if (imageFile) formData.append("image", imageFile);
    return formData;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return showError("Введите название номера");
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice <= 0) return showError("Укажите корректную цену");

    try {
      if (editingId) {
        const isBooked = editingRoom ? editingRoom.is_booked : false;
        const formData = buildFormData(isBooked);
        const updated = await api(`/api/rooms/${editingId}`, {
          method: "PUT",
          body: formData,
        });
        setRooms(rooms.map((r) => (Number(r.id) === Number(editingId) ? updated : r)));
        showSuccess("Номер обновлён");
      } else {
        const formData = buildFormData(false);
        const created = await api("/api/rooms", {
          method: "POST",
          body: formData,
        });
        setRooms([created, ...rooms]);
        showSuccess("Номер добавлен в каталог");
      }
      resetForm();
    } catch (err) {
      showError(err.message);
    }
  };

  const toggleBook = async (room) => {
    try {
      const nextBooked = !room.is_booked;
      const updated = await api(`/api/rooms/${room.id}`, {
        method: "PATCH",
        json: { is_booked: nextBooked },
      });
      setRooms(rooms.map((r) => (Number(r.id) === Number(room.id) ? updated : r)));
      showSuccess(nextBooked ? "Номер забронирован" : "Бронь снята");
    } catch (err) {
      showError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Удалить этот номер из каталога?")) return;
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

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    if (newPassword.length < 8) {
      showError("Новый пароль должен содержать минимум 8 символов");
      return;
    }
    setChangingPassword(true);
    try {
      const data = await api("/api/auth/change-password", {
        method: "POST",
        json: { currentPassword, newPassword },
      });
      showSuccess(data.message || "Пароль успешно обновлен!");
      setCurrentPassword("");
      setNewPassword("");
      setShowPasswordModal(false);
    } catch (err) {
      showError(err.message);
    } finally {
      setChangingPassword(false);
    }
  };

  const availableCount = rooms.filter((r) => !r.is_booked).length;
  const bookedCount = rooms.filter((r) => r.is_booked).length;

  const filteredRooms = useMemo(() => {
    return rooms
      .filter((r) => {
        if (filterStatus === "available" && r.is_booked) return false;
        if (filterStatus === "booked" && !r.is_booked) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const inTitle = (r.title || "").toLowerCase().includes(q);
          const inDesc = (r.description || "").toLowerCase().includes(q);
          if (!inTitle && !inDesc) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "price-asc") return Number(a.price) - Number(b.price);
        if (sortBy === "price-desc") return Number(b.price) - Number(a.price);
        if (sortBy === "title") return (a.title || "").localeCompare(b.title || "");
        return 0;
      });
  }, [rooms, searchQuery, filterStatus, sortBy]);

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
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowPasswordModal(true)}
                title="Сменить пароль учетной записи"
              >
                Пароль
              </button>
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
                  : `Показано ${filteredRooms.length} из ${rooms.length}`}
              </span>
            </div>

            {rooms.length > 0 && (
              <div className="catalog-toolbar">
                <div className="search-box">
                  <input
                    type="text"
                    placeholder="🔍 Поиск по названию или описанию..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="search-clear-btn"
                      onClick={() => setSearchQuery("")}
                      title="Очистить поиск"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="filters-group">
                  <div className="filter-pills">
                    <button
                      type="button"
                      className={`filter-pill ${filterStatus === "all" ? "active" : ""}`}
                      onClick={() => setFilterStatus("all")}
                    >
                      Все ({rooms.length})
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${filterStatus === "available" ? "active" : ""}`}
                      onClick={() => setFilterStatus("available")}
                    >
                      Свободные ({availableCount})
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${filterStatus === "booked" ? "active" : ""}`}
                      onClick={() => setFilterStatus("booked")}
                    >
                      Занятые ({bookedCount})
                    </button>
                  </div>

                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="sort-select"
                  >
                    <option value="default">Сортировка: По умолчанию</option>
                    <option value="price-asc">Цена: Сначала дешевле</option>
                    <option value="price-desc">Цена: Сначала дороже</option>
                    <option value="title">По названию (А-Я)</option>
                  </select>
                </div>
              </div>
            )}

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
              ) : filteredRooms.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🔍</div>
                  <p>По выбранным параметрам ничего не найдено.</p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: "0.5rem" }}
                    onClick={() => {
                      setSearchQuery("");
                      setFilterStatus("all");
                      setSortBy("default");
                    }}
                  >
                    Сбросить фильтры
                  </button>
                </div>
              ) : (
                filteredRooms.map((room) => (
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

      {showPasswordModal && (
        <div className="modal-backdrop" onClick={() => setShowPasswordModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Смена пароля</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowPasswordModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label htmlFor="currentPassword">Текущий пароль</label>
                <input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Введите текущий пароль"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="modalNewPassword">Новый пароль</label>
                <input
                  id="modalNewPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Минимум 8 символов"
                  minLength={8}
                  required
                />
              </div>
              <div className="form-actions" style={{ marginTop: "1.25rem" }}>
                <button type="submit" className="btn btn-primary" disabled={changingPassword}>
                  {changingPassword ? "Сохранение…" : "Сохранить новый пароль"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowPasswordModal(false)}
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
