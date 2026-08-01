//* Libraries imports
import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";

//* Local imports
import { Confirm } from "../../../src/cli/ui/Confirm.tsx";

describe("Confirm", () => {
  it("renders the question and Y/n hint", () => {
    const { lastFrame, unmount } = render(
      <Confirm message="Continue with setup?" onResolve={() => {}} />,
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Continue with setup?");
    expect(frame).toContain("(Y/n)");
    expect(frame).toContain("Press Y to confirm, N to cancel.");
    unmount();
  });

  it("resolves true when y is pressed", async () => {
    let accepted: boolean | undefined;
    const { stdin, unmount } = render(
      <Confirm
        message="Continue?"
        onResolve={(value) => {
          accepted = value;
        }}
      />,
    );

    stdin.write("y");
    await Bun.sleep(20);

    expect(accepted).toBe(true);
    unmount();
  });

  it("resolves false when n is pressed", async () => {
    let accepted: boolean | undefined;
    const { stdin, unmount } = render(
      <Confirm
        message="Continue?"
        onResolve={(value) => {
          accepted = value;
        }}
      />,
    );

    stdin.write("n");
    await Bun.sleep(20);

    expect(accepted).toBe(false);
    unmount();
  });
});
