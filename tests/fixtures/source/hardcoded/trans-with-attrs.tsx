function Trans(props: { children?: unknown; title?: string }) {
  return <>{props.children}</>;
}

export function TransWithAttrs() {
  return <Trans title="Tooltip copy">Hello from Trans</Trans>;
}
