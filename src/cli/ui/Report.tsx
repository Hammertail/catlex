//* Libraries imports
import { Box, Text } from "ink";

//* Local imports
import { buildReportView } from "./report-view.ts";
import { theme } from "./theme.ts";

//* Types imports
import type { ValidationResult } from "../../core/types.ts";
import type { IssueTone, LocaleSectionView, ReportIssueRow, ReportView } from "./report-view.ts";

type ReportProps = {
  result: ValidationResult;
  strictExtra: boolean;
};

function toneColor(tone: IssueTone): string {
  if (tone === "error") {
    return theme.error;
  }

  return theme.warning;
}

function StatusMark(props: { ok: boolean }) {
  if (props.ok) {
    return (
      <Text color={theme.success} bold>
        ✓
      </Text>
    );
  }

  return (
    <Text color={theme.error} bold>
      ✗
    </Text>
  );
}

function IssueRow(props: { row: ReportIssueRow }) {
  return (
    <Box paddingLeft={2}>
      <Text color={toneColor(props.row.tone)}>{props.row.label}</Text>
      <Text> {props.row.path}</Text>
    </Box>
  );
}

function LocaleSection(props: { section: LocaleSectionView }) {
  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Text>
        <StatusMark ok={props.section.ok} /> <Text bold>{props.section.locale}</Text>
        <Text color={theme.muted}>
          {" "}
          ({props.section.missingCount} missing, {props.section.extraCount} extra)
        </Text>
      </Text>

      {props.section.rows.map((row) => (
        <IssueRow key={row.key} row={row} />
      ))}
    </Box>
  );
}

function LocaleReports(props: { view: ReportView }) {
  if (props.view.emptyLocalesMessage !== null) {
    return <Text color={theme.warning}>{props.view.emptyLocalesMessage}</Text>;
  }

  return (
    <>
      {props.view.locales.map((section) => (
        <LocaleSection key={section.locale} section={section} />
      ))}
    </>
  );
}

function Verdict(props: { view: ReportView }) {
  const label = props.view.failed ? "Failed" : "Passed";
  const color = props.view.failed ? theme.error : theme.success;

  return (
    <Text>
      <Text color={color} bold>
        {label}
      </Text>
      <Text color={theme.muted}>
        {" "}
        · {props.view.totalMissing} missing · {props.view.totalExtra} extra
      </Text>
    </Text>
  );
}

export function Report(props: ReportProps) {
  const view = buildReportView(props.result, props.strictExtra);

  return (
    <Box flexDirection="column" paddingY={1}>
      <Text bold>Catlex validate</Text>
      <Text color={theme.muted}>
        base: {view.baseLocale}.json · dir: {view.messagesDir}
      </Text>
      <Box paddingTop={1} flexDirection="column">
        <LocaleReports view={view} />
      </Box>
      <Verdict view={view} />
    </Box>
  );
}
