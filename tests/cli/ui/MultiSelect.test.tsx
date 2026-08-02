//* Libraries imports
import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";

//* Local imports
import { MultiSelect } from "../../../src/cli/ui/MultiSelect.tsx";

const OPTIONS = [
  {
    value: "validate",
    title: "Validate messages",
    description: "Run validate --json",
  },
  {
    value: "review",
    title: "Review translations",
    description: "Gate with translate review",
  },
  {
    value: "translate",
    title: "Fill missing translations",
    description: "Run translate --yes and commit",
  },
] as const;

describe("MultiSelect", () => {
  it("renders titles, descriptions, and help text", () => {
    const { lastFrame, unmount } = render(
      <MultiSelect message="Select workflows" options={[...OPTIONS]} onResolve={() => {}} />,
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Select workflows");
    expect(frame).toContain("Validate messages");
    expect(frame).toContain("Run validate --json");
    expect(frame).toContain("Review translations");
    expect(frame).toContain("Space toggle · Enter confirm");
    unmount();
  });

  it("resolves an empty selection when Enter is pressed with nothing selected", async () => {
    let selected: string[] | undefined;
    const { stdin, unmount } = render(
      <MultiSelect
        message="Select workflows"
        options={[...OPTIONS]}
        onResolve={(values) => {
          selected = values;
        }}
      />,
    );

    stdin.write("\r");
    await Bun.sleep(20);

    expect(selected).toEqual([]);
    unmount();
  });

  it("toggles the focused option with Space and confirms with Enter", async () => {
    let selected: string[] | undefined;
    const { stdin, unmount } = render(
      <MultiSelect
        message="Select workflows"
        options={[...OPTIONS]}
        onResolve={(values) => {
          selected = values;
        }}
      />,
    );

    stdin.write(" ");
    await Bun.sleep(20);
    stdin.write("\u001B[B");
    await Bun.sleep(20);
    stdin.write(" ");
    await Bun.sleep(20);
    stdin.write("\r");
    await Bun.sleep(20);

    expect(selected).toEqual(["validate", "review"]);
    unmount();
  });

  it("untoggles a selected option when Space is pressed again", async () => {
    let selected: string[] | undefined;
    const { stdin, unmount } = render(
      <MultiSelect
        message="Select workflows"
        options={[...OPTIONS]}
        onResolve={(values) => {
          selected = values;
        }}
      />,
    );

    stdin.write(" ");
    await Bun.sleep(20);
    stdin.write(" ");
    await Bun.sleep(20);
    stdin.write("\r");
    await Bun.sleep(20);

    expect(selected).toEqual([]);
    unmount();
  });
});
