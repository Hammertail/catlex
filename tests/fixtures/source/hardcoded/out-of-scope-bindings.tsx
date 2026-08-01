export function OutOfScopeBindings(props: { ready: boolean }) {
  const label = "Save";

  return (
    <div>
      <button type="button">{label}</button>
      <span>{props.ready ? "Yes" : "No"}</span>
      <button type="button" children="Save" />
    </div>
  );
}
