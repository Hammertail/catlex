export function MessyRealworld() {
  const t = (key: string) => key;

  return (
    <>
      <section>
        <h1>Account settings</h1>
        <label>
          Display name
          <input placeholder="Jane Doe" aria-label="Display name" />
        </label>
        <label>
          {t("email")}
          <input placeholder={t("emailPlaceholder")} />
        </label>
        <img alt="Profile photo" src="/avatar.png" className="avatar" />
        <button type="button">
          <span aria-hidden="true">⚙️</span>
          Save preferences
        </button>
        <button type="button">{t("cancel")}</button>
      </section>
    </>
  );
}
