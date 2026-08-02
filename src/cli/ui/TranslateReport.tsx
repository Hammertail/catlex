//* Libraries imports
import { Box, Text } from "ink";

//* Local imports
import { buildTranslateReportView } from "./translate-report-view.ts";
import { theme } from "./theme.ts";

//* Types imports
import type { TranslateResult } from "../../core/translate/translate.ts";
import type { TranslateLocaleSectionView, TranslateReportView } from "./translate-report-view.ts";

type TranslateReportProps = {
  result: TranslateResult;
};

function LocaleSection(props: { section: TranslateLocaleSectionView }) {
  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Text bold>
        {props.section.locale}
        <Text color={theme.muted}>
          {" "}
          · {props.section.translatedCount} translated
          {props.section.skippedCount > 0 ? ` · ${props.section.skippedCount} skipped` : ""}
          {props.section.incompleteCount > 0
            ? ` · ${props.section.incompleteCount} incomplete`
            : ""}
          {props.section.warningCount > 0 ? ` · ${props.section.warningCount} warnings` : ""}
        </Text>
      </Text>
      {props.section.translatedLines.map((line) => (
        <Box key={line} paddingLeft={2}>
          <Text color={theme.success}>{line}</Text>
        </Box>
      ))}
      {props.section.skippedLines.map((line) => (
        <Box key={`skip-${line}`} paddingLeft={2}>
          <Text color={theme.muted}>skipped {line}</Text>
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

function Verdict(props: { view: TranslateReportView }) {
  return (
    <Text>
      <Text color={theme.info} bold>
        {props.view.summaryLabel}
      </Text>
      <Text color={theme.muted}>
        {" "}
        · {props.view.translatedCount} translated
        {props.view.writtenCount > 0 ? ` · ${props.view.writtenCount} files written` : ""}
      </Text>
    </Text>
  );
}

export function TranslateReport(props: TranslateReportProps) {
  const view = buildTranslateReportView(props.result);

  return (
    <Box flexDirection="column" paddingY={1}>
      <Text bold>Catlex translate</Text>
      <Text color={theme.warning}>{view.alphaMessage}</Text>
      <Text color={theme.muted}>
        base: {view.baseLocale} · dir: {view.messagesDir}
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
