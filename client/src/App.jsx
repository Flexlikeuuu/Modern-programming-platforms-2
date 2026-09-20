import React, { useState, useEffect, useRef, useMemo } from 'react';
import './App.css';

const API_BASE = '';

export default function App() {
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState(null);

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [existingImageUrl, setExistingImageUrl] = useState('');
  const [imageInputKey, setImageInputKey] = useState(0);

  const formRef = useRef(null);

  const editingRoom = useMemo(
    () => rooms.find((r) => Number(r.id) === Number(editingId)) ?? null,
    [rooms, editingId],
  );

  const [newImagePreview, setNewImagePreview] = useState(null);

  useEffect(() => {
    if (!imageFile) {
      setNewImagePreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(imageFile);
    setNewImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const previewImageSrc =
    newImagePreview ??
    (existingImageUrl ? `${API_BASE}${existingImageUrl}` : null);

  const fetchRooms = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/rooms`);
      if (!res.ok) throw new Error('Не удалось загрузить номера');
      const data = await res.json();
      setRooms(data);
    } catch (err) {
      showError(err.message);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const showError = (msg) => {
    setError(msg);
    setTimeout(() => setError(''), 4000);
  };

  const showSuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  };

  const resetForm = () => {
    setTitle('');
    setPrice('');
    setDescription('');
    setImageFile(null);
    setExistingImageUrl('');
    setEditingId(null);
    setImageInputKey((k) => k + 1);
  };

  const buildFormData = (isBooked) => {
    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('price', price);
    formData.append('description', description);
    if (isBooked !== undefined) {
      formData.append('is_booked', String(isBooked));
    }
    if (imageFile) {
      formData.append('image', imageFile);
    }
    return formData;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (editingId) {
      try {
        const res = await fetch(`${API_BASE}/api/rooms/${editingId}`, {
          method: 'PUT',
          body: buildFormData(editingRoom?.is_booked ?? false),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка при обновлении');

        setRooms(rooms.map((r) => (Number(r.id) === Number(editingId) ? data : r)));
        showSuccess('Номер успешно обновлён');
        resetForm();
      } catch (err) {
        showError(err.message);
      }
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/rooms`, {
        method: 'POST',
        body: buildFormData(),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка при создании');

      setRooms([data, ...rooms]);
      showSuccess('Номер успешно добавлен');
      resetForm();
    } catch (err) {
      showError(err.message);
    }
  };

  const toggleBook = async (room) => {
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${room.id}/book`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_booked: !room.is_booked }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка изменения статуса');

      setRooms(rooms.map((r) => (Number(r.id) === Number(room.id) ? data : r)));
      showSuccess(room.is_booked ? 'Бронь снята' : 'Номер забронирован');
    } catch (err) {
      showError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Вы действительно хотите удалить этот номер?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка при удалении');

      setRooms(rooms.filter((r) => Number(r.id) !== Number(id)));
      if (Number(editingId) === Number(id)) {
        resetForm();
      }
      showSuccess('Номер удалён');
    } catch (err) {
      showError(err.message);
    }
  };

  const startEdit = (room) => {
    setEditingId(Number(room.id));
    setTitle(room.title || '');
    setPrice(room.price != null ? String(room.price) : '');
    setDescription(room.description || '');
    setImageFile(null);
    setExistingImageUrl(room.image_url || '');
    setImageInputKey((k) => k + 1);

    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const availableCount = rooms.filter((r) => !r.is_booked).length;
  const bookedCount = rooms.filter((r) => r.is_booked).length;

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-inner">
          <div className="hero-badge">Hotel Booking System</div>
          <h1>Бронирование<br />гостиничных номеров</h1>
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
        <div className="layout">
          <aside
            ref={formRef}
            className={`form-panel${editingId ? ' form-panel--editing' : ''}`}
          >
            <h2>{editingId ? 'Редактировать номер' : 'Новый номер'}</h2>
            {editingId && editingRoom && (
              <p className="form-edit-hint">
                Редактируется: «{editingRoom.title}»
              </p>
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
                  {editingId ? 'Новая фотография (необязательно)' : 'Фотография'}
                </label>
                {previewImageSrc && (
                  <>
                    <span className="image-preview-label">
                      {imageFile ? 'Новое фото' : 'Текущее фото'}
                    </span>
                    <img
                      src={previewImageSrc}
                      alt="Предпросмотр"
                      className="image-preview"
                    />
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
                  {editingId ? 'Сохранить' : 'Добавить'}
                </button>
                {editingId && (
                  <button type="button" className="btn btn-secondary" onClick={resetForm}>
                    Отмена
                  </button>
                )}
              </div>
            </form>
          </aside>

          <section>
            <div className="catalog-header">
              <h2>Каталог</h2>
              <span className="catalog-count">
                {rooms.length === 0
                  ? 'Пока пусто'
                  : `${rooms.length} ${rooms.length === 1 ? 'номер' : rooms.length < 5 ? 'номера' : 'номеров'}`}
              </span>
            </div>

            <div className="rooms-grid">
              {rooms.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🏨</div>
                  <p>Номера пока не добавлены.<br />Создайте первый номер в форме слева.</p>
                </div>
              ) : (
                rooms.map((room) => (
                  <article
                    key={room.id}
                    className={`room-card${room.is_booked ? ' booked' : ''}${
                      Number(editingId) === Number(room.id) ? ' room-card--editing' : ''
                    }`}
                  >
                    <div className="room-image-wrap">
                      {room.image_url ? (
                        <img src={`${API_BASE}${room.image_url}`} alt={room.title} />
                      ) : (
                        <div className="room-image-placeholder">Нет фото</div>
                      )}
                      <span
                        className={`status-badge ${
                          room.is_booked ? 'status-booked' : 'status-available'
                        }`}
                      >
                        {room.is_booked ? 'Занят' : 'Свободен'}
                      </span>
                    </div>
                    <div className="room-body">
                      <h3 className="room-title">{room.title}</h3>
                      <p className="room-price">
                        {Number(room.price).toLocaleString('ru-RU')} ₽
                        <span> / ночь</span>
                      </p>
                      {room.description && (
                        <p className="room-description">{room.description}</p>
                      )}
                      <div className="room-actions">
                        <button
                          type="button"
                          className={`btn btn-sm ${room.is_booked ? 'btn-unbook' : 'btn-book'}`}
                          onClick={() => toggleBook(room)}
                        >
                          {room.is_booked ? 'Снять бронь' : 'Забронировать'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-edit"
                          onClick={() => startEdit(room)}
                        >
                          {Number(editingId) === Number(room.id) ? 'Редактируется…' : 'Изменить'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-delete"
                          onClick={() => handleDelete(room.id)}
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
