export function TemplateLiteral() {
  const name = "Ada";

  return (
    <div>
      <span>{`Hello`}</span>
      <span>{`Hi ${name}`}</span>
    </div>
  );
}
