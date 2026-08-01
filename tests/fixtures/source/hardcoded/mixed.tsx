export function Mixed() {
  const t = (key: string) => key;

  return (
    <div>
      <h1>Welcome</h1>
      <button>{t("submit")}</button>
      <input placeholder="Your name" aria-label="Name field" />
      <img alt="Logo" src="/logo.png" className="logo" />
      <span>{" "}</span>
    </div>
  );
}
