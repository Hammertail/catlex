//* Libraries imports
import { Box, Text } from "ink";

//* Local imports
import { buildScanReportView } from "./scan-report-view.ts";
import { theme } from "./theme.ts";

//* Types imports
import type { ScanResult } from "../../core/scan/types.ts";
import type { ScanErrorRow, ScanIssueRow, ScanReportView } from "./scan-report-view.ts";

type ScanReportProps = {
  result: ScanResult;
};

function IssueRow(props: { row: ScanIssueRow }) {
  return (
    <Box paddingLeft={2} flexDirection="column">
      <Text>
        <Text color={theme.error}>{props.row.kindLabel}</Text>
        <Text> {props.row.location}</Text>
      </Text>
      <Box paddingLeft={2}>
        <Text color={theme.muted}>"{props.row.text}"</Text>
      </Box>
    </Box>
  );
}

function ErrorRow(props: { row: ScanErrorRow }) {
  return (
    <Box paddingLeft={2} flexDirection="column">
      <Text>
        <Text color={theme.error}>scan-error</Text>
        <Text> {props.row.location}</Text>
      </Text>
      <Box paddingLeft={2}>
        <Text color={theme.muted}>{props.row.message}</Text>
      </Box>
    </Box>
  );
}

function IssueList(props: { view: ScanReportView }) {
  if (props.view.emptyMessage !== null) {
    return <Text color={theme.success}>{props.view.emptyMessage}</Text>;
  }

  return (
    <Box flexDirection="column">
      {props.view.errorRows.map((row) => (
        <ErrorRow key={row.key} row={row} />
      ))}
      {props.view.rows.map((row) => (
        <IssueRow key={row.key} row={row} />
      ))}
    </Box>
  );
}

function Verdict(props: { view: ScanReportView }) {
  const label = props.view.failed ? "Failed" : "Passed";
  const color = props.view.failed ? theme.error : theme.success;
  const errorSuffix = props.view.errorCount > 0 ? ` · ${props.view.errorCount} scan error(s)` : "";

  return (
    <Text>
      <Text color={color} bold>
        {label}
      </Text>
      <Text color={theme.muted}>
        {" "}
        · {props.view.issueCount} hardcoded{errorSuffix}
      </Text>
    </Text>
  );
}

export function ScanReport(props: ScanReportProps) {
  const view = buildScanReportView(props.result);

  return (
    <Box flexDirection="column" paddingY={1}>
      <Text bold>Catlex scan</Text>
      <Text color={theme.warning}>{view.alphaMessage}</Text>
      <Text color={theme.muted}>dir: {view.displayRootDir}</Text>
      <Box paddingTop={1} flexDirection="column">
        <IssueList view={view} />
      </Box>
      <Box paddingTop={1}>
        <Verdict view={view} />
      </Box>
    </Box>
  );
}
