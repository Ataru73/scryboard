import type { Scene } from "@scryboard/shared";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import type { useScenes } from "./useScenes";

interface Props {
  roomId: string;
  gmToken: string;
  /** Scena dove si trovano i giocatori. */
  activeScene: string | null;
  /** Scena che il GM sta guardando. */
  viewScene: string | null;
  onOpen: (sceneId: string) => void;
  scenes: ReturnType<typeof useScenes>;
}

/** Cassetto delle scene: il GM ne prepara una mentre i giocatori restano sull'attiva. */
export function ScenesPanel({ roomId, gmToken, activeScene, viewScene, onOpen, scenes }: Props) {
  const { t } = useTranslation();
  const { scenes: list, error, run } = scenes;
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const newId = useId();

  async function create(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const scene = await run(() => api.scenes.create(roomId, gmToken, name));
    if (scene) {
      setNewName("");
      onOpen(scene.id);
    }
  }

  async function duplicate(scene: Scene) {
    const copy = await run(() =>
      api.scenes.duplicate(
        roomId,
        gmToken,
        scene.id,
        t("social.scenes.copyName", { name: scene.name }).slice(0, 40),
      ),
    );
    if (copy) onOpen(copy.id);
  }

  async function rename(event: FormEvent) {
    event.preventDefault();
    if (!renaming) return;
    const name = renaming.name.trim();
    if (name) await run(() => api.scenes.rename(roomId, gmToken, renaming.id, name));
    setRenaming(null);
  }

  async function remove(scene: Scene) {
    setConfirming(null);
    await run(() => api.scenes.remove(roomId, gmToken, scene.id));
    if (viewScene === scene.id && activeScene) onOpen(activeScene);
  }

  return (
    <section className="scenes" aria-label={t("social.scenes.title")}>
      <h2>{t("social.scenes.title")}</h2>
      <ul className="scene-list">
        {list.map((scene) => {
          const isActive = scene.id === activeScene;
          const isViewed = scene.id === viewScene;
          return (
            <li key={scene.id} className={isViewed ? "scene viewed" : "scene"}>
              {renaming?.id === scene.id ? (
                <form className="scene-rename" onSubmit={rename}>
                  <input
                    aria-label={t("social.scenes.renameLabel")}
                    value={renaming.name}
                    maxLength={40}
                    // biome-ignore lint/a11y/noAutofocus: il campo compare solo su richiesta.
                    autoFocus
                    onChange={(e) => setRenaming({ id: scene.id, name: e.target.value })}
                    onBlur={() => setRenaming(null)}
                  />
                </form>
              ) : (
                <button
                  type="button"
                  className="scene-name"
                  aria-current={isViewed ? "true" : undefined}
                  title={t("social.scenes.openTitle")}
                  onClick={() => onOpen(scene.id)}
                >
                  {scene.name}
                  {isActive && <span className="badge">{t("social.scenes.players")}</span>}
                </button>
              )}
              <span className="scene-actions">
                {!isActive && (
                  <button
                    type="button"
                    className="primary"
                    title={t("social.scenes.activateTitle")}
                    onClick={() =>
                      void run(() => api.scenes.activate(roomId, gmToken, scene.id)).then(() =>
                        onOpen(scene.id),
                      )
                    }
                  >
                    {t("social.scenes.activate")}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={t("social.scenes.rename", { name: scene.name })}
                  title={t("social.scenes.renameTitle")}
                  onClick={() => setRenaming({ id: scene.id, name: scene.name })}
                >
                  ✎
                </button>
                <button
                  type="button"
                  aria-label={t("social.scenes.duplicate", { name: scene.name })}
                  title={t("social.scenes.duplicateTitle")}
                  onClick={() => void duplicate(scene)}
                >
                  ⧉
                </button>
                {!isActive &&
                  (confirming === scene.id ? (
                    <button
                      type="button"
                      className="danger"
                      aria-label={t("social.scenes.confirmDelete", { name: scene.name })}
                      onClick={() => void remove(scene)}
                      onBlur={() => setConfirming(null)}
                    >
                      {t("social.scenes.deleteQuestion")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={t("social.scenes.delete", { name: scene.name })}
                      title={t("social.scenes.deleteTitle")}
                      onClick={() => setConfirming(scene.id)}
                    >
                      ×
                    </button>
                  ))}
              </span>
            </li>
          );
        })}
      </ul>
      <form className="scene-new" onSubmit={create}>
        <label htmlFor={newId} className="visually-hidden">
          {t("social.scenes.createLabel")}
        </label>
        <input
          id={newId}
          value={newName}
          maxLength={40}
          placeholder={t("social.scenes.createPlaceholder")}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" disabled={!newName.trim()}>
          {t("social.scenes.add")}
        </button>
      </form>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
