//* Libraries imports
import { Box, Text } from "ink";

//* Local imports
import { buildReviewReportView } from "./review-report-view.ts";
import { theme } from "./theme.ts";

//* Types imports
import type { ReviewResult } from "../../core/translate/review.ts";
import type { ReviewLocaleSectionView, ReviewReportView } from "./review-report-view.ts";

type ReviewReportProps = {
  result: ReviewResult;
};

function LocaleSection(props: { section: ReviewLocaleSectionView }) {
  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Text bold>
        {props.section.locale}
        <Text color={theme.muted}>
          {" "}
          · {props.section.okCount} ok
          {props.section.wrongCount > 0 ? ` · ${props.section.wrongCount} wrong` : ""}
          {props.section.missingCount > 0 ? ` · ${props.section.missingCount} missing` : ""}
          {props.section.fixCount > 0 ? ` · ${props.section.fixCount} fixes` : ""}
          {props.section.incompleteCount > 0
            ? ` · ${props.section.incompleteCount} incomplete`
            : ""}
        </Text>
      </Text>
      {props.section.itemLines.map((line) => (
        <Box key={line} paddingLeft={2}>
          <Text
            color={
              line.startsWith("ok ")
                ? theme.success
                : line.startsWith("missing ")
                  ? theme.error
                  : theme.warning
            }
          >
            {line}
          </Text>
        </Box>
      ))}
      {props.section.fixLines.map((line) => (
        <Box key={`fix-${line}`} paddingLeft={2}>
          <Text color={theme.info}>fix {line}</Text>
        </Box>
      ))}
      {props.section.incompleteLines.map((line) => (
        <Box key={`incomplete-${line}`} paddingLeft={2}>
          <Text color={theme.warning}>incomplete {line}</Text>
        </Box>
      ))}
      {props.section.warningLines.map((line) => (
        <Box key={`warn-${line}`} paddingLeft={2}>
          <Text color={theme.warning}>{line}</Text>
        </Box>
      ))}
    </Box>
  );
}

function Verdict(props: { view: ReviewReportView }) {
  return (
    <Text>
      <Text color={props.view.ok ? theme.success : theme.error} bold>
        {props.view.summaryLabel}
      </Text>
      <Text color={theme.muted}>
        {props.view.fixCount > 0 ? ` · ${props.view.fixCount} fixes` : ""}
        {props.view.writtenCount > 0 ? ` · ${props.view.writtenCount} files written` : ""}
      </Text>
    </Text>
  );
}

export function ReviewReport(props: ReviewReportProps) {
  const view = buildReviewReportView(props.result);

  return (
    <Box flexDirection="column" paddingY={1}>
      <Text bold>Catlex translate review</Text>
      <Text color={theme.warning}>{view.alphaMessage}</Text>
      <Text color={theme.muted}>
        base: {view.baseLocale} · dir: {view.messagesDir}
        {view.since !== null ? ` · since: ${view.since}` : ""}
        {view.autoFix ? " · auto-fix" : ""}
        {view.dryRun ? " · dry-run" : ""}
      </Text>
      <Box paddingTop={1} flexDirection="column">
        {view.emptyMessage !== null ? (
          <Text color={theme.success}>{view.emptyMessage}</Text>
        ) : (
          view.sections.map((section) => <LocaleSection key={section.locale} section={section} />)
        )}
      </Box>
      <Box paddingTop={1}>
        <Verdict view={view} />
      </Box>
    </Box>
  );
}
