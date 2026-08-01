export function TRich() {
  const t = Object.assign((key: string) => key, {
    rich: (key: string) => key,
    markup: (key: string) => key,
  });

  return (
    <div>
      <p>{t.rich("welcome")}</p>
      <p>{t.markup("footer")}</p>
    </div>
  );
}
