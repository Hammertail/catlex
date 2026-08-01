const Form = {
  Label(props: { children?: unknown }) {
    return <label>{props.children}</label>;
  },
};

export function NestedComponents() {
  const count = 3;

  return (
    <div>
      <Form.Label>Full name</Form.Label>
      <ul>
        <li>
          <article>
            <h2>Team plan</h2>
            <p>
              {count} seats remaining
            </p>
          </article>
        </li>
        <li>
          <article>
            <h2>Starter plan</h2>
            <span>
              Includes {"basic"} support
            </span>
          </article>
        </li>
      </ul>
    </div>
  );
}
