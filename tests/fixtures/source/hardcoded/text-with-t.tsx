export function TextWithT() {
  const t = (key: string) => key;
  return <button>{t("save")}</button>;
}
