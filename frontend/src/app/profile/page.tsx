"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { api, apiErrorMessage } from "@/lib/api";

// UserContextData's nested fields are all optional (a freshly saved
// profile may only have some of them) — the form always works with the
// fully-populated shape below, defaulting missing values to "".
interface UserContextForm {
  general: { tone: string; banned_topics: string };
  content: { niche: string; audience: string; products: string; examples: string };
  research: { topics: string; depth: string };
  documents: { typical_formats: string };
}

const EMPTY: UserContextForm = {
  general: { tone: "", banned_topics: "" },
  content: { niche: "", audience: "", products: "", examples: "" },
  research: { topics: "", depth: "" },
  documents: { typical_formats: "" },
};

export default function ProfilePage() {
  return (
    <RequireAuth>
      <Profile />
    </RequireAuth>
  );
}

function Profile() {
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
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Аккаунт</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Профиль</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Заполните один раз — агенты будут использовать это как фон, вместо того чтобы
        спрашивать одно и то же на каждом запуске.
      </p>

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
        <div className="mt-8 flex flex-col gap-6">
          <ProfileSection title="Общее">
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
          </ProfileSection>

          <ProfileSection title="Контент">
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
          </ProfileSection>

          <ProfileSection title="Исследования">
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
          </ProfileSection>

          <ProfileSection title="Документы">
            <Field
              label="Типичные форматы"
              value={data.documents.typical_formats}
              onChange={(value) => updateField("documents", "typical_formats", value)}
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
    </div>
  );
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">{title}</h2>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
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
