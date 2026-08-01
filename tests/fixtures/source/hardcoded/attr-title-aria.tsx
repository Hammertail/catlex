export function AttrTitleAria() {
  return (
    <div>
      <a href="/help" title="Open help center" id="help-link" data-testid="help">
        ?
      </a>
      <input
        aria-description="Used for invoices"
        aria-placeholder="Search invoices"
        aria-roledescription="Search field"
        aria-valuetext="Fifty percent"
      />
    </div>
  );
}
