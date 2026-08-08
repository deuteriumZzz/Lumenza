"use client";

/* User-uploaded pet images are rendered from the validated media endpoint. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RequireAuth } from "@/components/require-auth";
import { PetAvatar, petPresetLabel } from "@/components/pet-avatar";
import { PET_PRESETS, api, apiErrorMessage, type PetInput, type PetPreset, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { WorkspaceTopActions } from "@/components/workspace-top-actions";

// UserContextData's nested fields are all optional (a freshly saved
// profile may only have some of them) — the form always works with the
// fully-populated shape below, defaulting missing values to "".
interface UserContextForm {
  general: { tone: string; banned_topics: string };
  content: { niche: string; audience: string; products: string; examples: string };
  research: { topics: string; depth: string };
  documents: { typical_formats: string };
  finance: { topics: string; risk_profile: string };
}

const EMPTY: UserContextForm = {
  general: { tone: "", banned_topics: "" },
  content: { niche: "", audience: "", products: "", examples: "" },
  research: { topics: "", depth: "" },
  documents: { typical_formats: "" },
  finance: { topics: "", risk_profile: "" },
};

export default function ProfilePage() {
  return (
    <RequireAuth>
      <Profile />
    </RequireAuth>
  );
}

function Profile() {
  const { user, updatePet, removePet } = useAuth();
  const [data, setData] = useState<UserContextForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.userContext().then(
      (entry) => {
        if (cancelled) return;
        setData({
          general: { ...EMPTY.general, ...entry.data.general },
          content: { ...EMPTY.content, ...entry.data.content },
          research: { ...EMPTY.research, ...entry.data.research },
          documents: { ...EMPTY.documents, ...entry.data.documents },
          finance: { ...EMPTY.finance, ...entry.data.finance },
        });
      },
      (err) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, "Не удалось загрузить профиль."));
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  function updateField<S extends keyof UserContextForm>(
    section: S,
    key: keyof UserContextForm[S],
    value: string
  ) {
    setData((prev) =>
      prev ? { ...prev, [section]: { ...prev[section], [key]: value } } : prev
    );
    setSaved(false);
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.updateUserContext(data);
      setSaved(true);
    } catch (err) {
      setSaveError(apiErrorMessage(err, "Не удалось сохранить профиль."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="account-workspace mx-auto w-full max-w-[92rem] flex-1 px-4 pb-12 sm:px-8 lg:px-10">
      <header className="account-workspace-header">
        <div><h1>Account</h1><p>Управляйте профилем, компанией и персональными настройками.</p></div>
        <WorkspaceTopActions />
      </header>

      <div className="account-workspace-layout">
        <nav aria-label="Аккаунт" className="account-subnavigation">
          <p>Account</p>
          <Link href="/profile" aria-current="page">Профиль <span>01</span></Link>
          <Link href="/usage">Использование <span>02</span></Link>
          <Link href="/pricing">Тариф и кредиты <span>03</span></Link>
          <span aria-disabled="true">Безопасность <small>Скоро</small></span>
          <span aria-disabled="true">API-ключи <small>Скоро</small></span>
          <span aria-disabled="true">Уведомления <small>Скоро</small></span>
        </nav>

        <section aria-label="Настройки профиля" className="account-workspace-content">
      {user && (
        <PetSection user={user} onUpdate={updatePet} onRemove={removePet} />
      )}

      <div className="account-identity-card">
        <div className="account-identity-mark">{(user?.username || "L").slice(0, 1).toUpperCase()}</div>
        <div><p>{user?.username}</p><span>{user?.email || "Lumenza account"}</span></div>
        <em>{user?.tier || "free"}</em>
        <div className="account-current-plan"><span>Текущий план</span><strong>{user?.tier === "paid" ? "Pro Plan" : "Базовый план"}</strong><Link href="/pricing">Управление</Link></div>
      </div>

      {loadError && (
        <p role="alert" className="mt-6 text-sm text-danger">
          {loadError}
        </p>
      )}

      {!loadError && data === null && (
        <p role="status" className="mt-10 text-sm text-muted">
          Загрузка…
        </p>
      )}

      {data && (
        <div className="mt-5 flex flex-col gap-6">
          <ProfileSection title="Контекст агентов">
            <Field
              label="Тон общения"
              value={data.general.tone}
              onChange={(value) => updateField("general", "tone", value)}
            />
            <Field
              label="Запрещённые темы"
              value={data.general.banned_topics}
              onChange={(value) => updateField("general", "banned_topics", value)}
            />
            <Field
              label="Ниша"
              value={data.content.niche}
              onChange={(value) => updateField("content", "niche", value)}
            />
            <Field
              label="Аудитория"
              value={data.content.audience}
              onChange={(value) => updateField("content", "audience", value)}
            />
            <Field
              label="Продукты"
              value={data.content.products}
              onChange={(value) => updateField("content", "products", value)}
            />
            <Field
              label="Примеры хороших публикаций"
              value={data.content.examples}
              onChange={(value) => updateField("content", "examples", value)}
            />
            <Field
              label="Темы, которые интересны"
              value={data.research.topics}
              onChange={(value) => updateField("research", "topics", value)}
            />
            <Field
              label="Глубина проработки"
              value={data.research.depth}
              onChange={(value) => updateField("research", "depth", value)}
            />
            <Field
              label="Типичные форматы"
              value={data.documents.typical_formats}
              onChange={(value) => updateField("documents", "typical_formats", value)}
            />
            <Field
              label="Темы/активы, которые интересны"
              value={data.finance.topics}
              onChange={(value) => updateField("finance", "topics", value)}
            />
            <Field
              label="Риск-профиль"
              value={data.finance.risk_profile}
              onChange={(value) => updateField("finance", "risk_profile", value)}
            />
          </ProfileSection>

          {saveError && (
            <p role="alert" className="text-sm text-danger">
              {saveError}
            </p>
          )}
          {saved && !saveError && (
            <p role="status" className="text-sm text-muted">
              Сохранено.
            </p>
          )}

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="btn-primary self-start"
          >
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      )}
        </section>
      </div>
    </div>
  );
}

const PET_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PET_IMAGE_BYTES = 5 * 1024 * 1024;

function PetSection({
  user,
  onUpdate,
  onRemove,
}: {
  user: User;
  onUpdate: (input: PetInput) => Promise<User>;
  onRemove: () => Promise<User>;
}) {
  const [name, setName] = useState(user.pet_name || "");
  const [show, setShow] = useState(Boolean(user.show_pet));
  const [image, setImage] = useState<File | undefined>();
  const [preset, setPreset] = useState<PetPreset | "">(user.pet_preset || "");
  const [previewUrl, setPreviewUrl] = useState<string | null>(user.pet_image);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const objectPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectPreviewRef.current) URL.revokeObjectURL(objectPreviewRef.current);
    };
  }, []);

  function clearObjectPreview() {
    if (objectPreviewRef.current) URL.revokeObjectURL(objectPreviewRef.current);
    objectPreviewRef.current = null;
  }

  function chooseImage(file: File | undefined) {
    setSaved(false);
    if (!file) {
      clearObjectPreview();
      setImage(undefined);
      setPreviewUrl(user.pet_image);
      return;
    }
    if (!PET_IMAGE_TYPES.has(file.type)) {
      setError("Выберите изображение JPEG, PNG или WebP.");
      clearObjectPreview();
      setImage(undefined);
      setPreviewUrl(user.pet_image);
      return;
    }
    if (file.size > MAX_PET_IMAGE_BYTES) {
      setError("Размер изображения должен быть не больше 5 МБ.");
      clearObjectPreview();
      setImage(undefined);
      setPreviewUrl(user.pet_image);
      return;
    }
    setError(null);
    setImage(file);
    setPreset("");
    clearObjectPreview();
    if (typeof URL.createObjectURL === "function") {
      const objectUrl = URL.createObjectURL(file);
      objectPreviewRef.current = objectUrl;
      setPreviewUrl(objectUrl);
    }
  }

  function choosePreset(next: PetPreset) {
    setSaved(false);
    setError(null);
    setPreset(next);
    setImage(undefined);
    clearObjectPreview();
    setPreviewUrl(null);
  }

  async function savePet() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await onUpdate({ name: name.trim(), image, preset, show });
      setName(updated.pet_name);
      setShow(updated.show_pet);
      setImage(undefined);
      setPreset(updated.pet_preset);
      clearObjectPreview();
      setPreviewUrl(updated.pet_image);
      setSaved(true);
    } catch (err) {
      setError(apiErrorMessage(err, "Не удалось сохранить питомца."));
    } finally {
      setSaving(false);
    }
  }

  async function deletePet() {
    setRemoving(true);
    setSaved(false);
    setError(null);
    try {
      await onRemove();
      setName("");
      setShow(false);
      setImage(undefined);
      setPreset("");
      clearObjectPreview();
      setPreviewUrl(null);
      setConfirmDeleteOpen(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Не удалось удалить питомца."));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section className="account-companion-card relative mt-5 overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 size-44 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-stretch">
        <div className="flex aspect-square w-full shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface shadow-sm sm:w-72">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={`Питомец ${name || user.username}`}
              width={288}
              height={288}
              className="size-full object-cover"
            />
          ) : preset ? (
            <PetAvatar
              user={{ pet_image: null, pet_preset: preset, pet_name: name, username: user.username }}
              className="pet-avatar-preview"
            />
          ) : (
            <span aria-hidden="true" className="text-5xl">✦</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
            Компаньон Lumenza
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">Мой питомец</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Добавьте своего компаньона — он появится рядом с аккаунтом и сделает пространство личным.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted">Имя питомца</span>
              <input
                value={name}
                maxLength={40}
                onChange={(event) => {
                  setName(event.target.value);
                  setSaved(false);
                }}
                className="input"
                placeholder="Например, Люми"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted">Фото питомца</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => chooseImage(event.target.files?.[0])}
                className="block min-h-10 w-full cursor-pointer rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink"
              />
            </label>
          </div>

          <p className="mt-4 text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Или выберите готового компаньона
          </p>
          <div className="pet-preset-gallery" role="group" aria-label="Выбор пресета питомца">
            {PET_PRESETS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={preset === option}
                onClick={() => choosePreset(option)}
                className="pet-preset-gallery-item"
              >
                <PetAvatar
                  user={{ pet_image: null, pet_preset: option, pet_name: "", username: user.username }}
                  labelled={false}
                />
                <span>{petPresetLabel(option)}</span>
              </button>
            ))}
          </div>

          <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface/60 p-3">
            <input
              type="checkbox"
              aria-label="Показывать питомца в профиле"
              checked={show}
              onChange={(event) => {
                setShow(event.target.checked);
                setSaved(false);
              }}
              className="size-4 accent-primary"
            />
            <span>
              <span className="block text-sm font-medium text-ink">Показывать питомца</span>
              <span className="block text-xs leading-5 text-muted">В аватаре бокового меню и карточке аккаунта.</span>
            </span>
          </label>

          {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
          {saved && !error && <p role="status" className="mt-3 text-sm text-muted">Питомец сохранён.</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void savePet()}
              disabled={saving || removing}
              className="btn-primary"
            >
              {saving ? "Сохраняем…" : "Сохранить питомца"}
            </button>
            {(user.pet_image || user.pet_preset || previewUrl || preset) && (
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={saving || removing}
                className="rounded-md border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
              >
                {removing ? "Удаляем…" : "Удалить питомца"}
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Удалить питомца «${name || user.username}»?`}
        description="Фото и настройки питомца будут удалены безвозвратно."
        confirmLabel="Удалить"
        pendingLabel="Удаляем…"
        pending={removing}
        onConfirm={() => void deletePet()}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </section>
  );
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="account-context-section rounded-md border border-border bg-surface p-4">
      <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">{title}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="input" />
    </label>
  );
}
