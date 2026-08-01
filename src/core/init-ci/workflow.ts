export function generateValidateMessagesWorkflow(): string {
  return `name: Validate messages

on:
  push:
  pull_request:

jobs:
  validate-messages:
    name: Validate translation messages
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install catlex
        run: |
          set -euo pipefail
          curl -fsSL https://github.com/Hammertail/catlex/releases/latest/download/install.sh | bash
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"

      - name: Validate translations
        run: catlex validate --json
`;
}
