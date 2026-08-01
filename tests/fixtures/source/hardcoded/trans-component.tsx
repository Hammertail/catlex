function Trans(props: { children?: unknown }) {
  return <>{props.children}</>;
}

export function TransComponent() {
  return <Trans>Hello</Trans>;
}
