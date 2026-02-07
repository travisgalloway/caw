import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTerminalSize } from '../hooks/useTerminalSize';
import { useAppStore } from '../store';
import type { SlashCommand } from '../utils/parseCommand';
import { COMMAND_DESCRIPTIONS, completeCommand } from '../utils/parseCommand';
import { horizontalRule, THEME } from '../utils/theme';

const MAX_VISIBLE_SUGGESTIONS = 8;

interface CommandPromptProps {
  onSubmit: (input: string) => void;
}

export function CommandPrompt({ onSubmit }: CommandPromptProps): React.JSX.Element {
  const promptValue = useAppStore((s) => s.promptValue);
  const promptFocused = useAppStore((s) => s.promptFocused);
  const promptError = useAppStore((s) => s.promptError);
  const promptSuccess = useAppStore((s) => s.promptSuccess);
  const { setPromptValue, setPromptFocused, clearPromptFeedback } = useAppStore();
  const { columns: termWidth } = useTerminalSize();

  const [suggestionIdx, setSuggestionIdx] = useState(-1);

  // Compute candidates when input starts with /
  const { candidates } = promptValue.startsWith('/')
    ? completeCommand(promptValue)
    : { candidates: [] as string[] };
  const showSuggestions = promptFocused && candidates.length > 0;

  // Reset suggestion index when candidates change
  const prevCandidatesRef = useRef(candidates);
  useEffect(() => {
    const prev = prevCandidatesRef.current;
    if (prev.length !== candidates.length || prev.some((c, i) => c !== candidates[i])) {
      setSuggestionIdx(-1);
      prevCandidatesRef.current = candidates;
    }
  }, [candidates]);

  // Auto-clear feedback after 5s
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (promptError || promptSuccess) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        clearPromptFeedback();
      }, 5000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [promptError, promptSuccess, clearPromptFeedback]);

  useInput((input, key) => {
    // Ignore ctrl/meta combos — let them pass through
    if (key.ctrl || key.meta) return;

    // Arrow keys — navigate suggestions when visible, otherwise pass through
    if (key.upArrow || key.downArrow) {
      if (showSuggestions) {
        setSuggestionIdx((prev) => {
          if (key.downArrow) {
            const next = prev + 1;
            return next >= candidates.length ? 0 : next;
          }
          const next = prev - 1;
          return next < 0 ? candidates.length - 1 : next;
        });
        return;
      }
      return;
    }

    if (key.leftArrow || key.rightArrow) return;

    if (key.escape) {
      setPromptValue('');
      setPromptFocused(false);
      clearPromptFeedback();
      setSuggestionIdx(-1);
      return;
    }

    if (key.return) {
      // If a suggestion is highlighted, use it
      if (showSuggestions && suggestionIdx >= 0 && suggestionIdx < candidates.length) {
        const selected = `/${candidates[suggestionIdx]}`;
        onSubmit(selected);
        setPromptValue('');
        setPromptFocused(false);
        setSuggestionIdx(-1);
        return;
      }
      if (promptValue) {
        onSubmit(promptValue);
        setPromptValue('');
        setPromptFocused(false);
        setSuggestionIdx(-1);
      }
      return;
    }

    if (key.backspace || key.delete) {
      if (promptValue.length > 0) {
        const newValue = promptValue.slice(0, -1);
        setPromptValue(newValue);
        setSuggestionIdx(-1);
        if (newValue.length === 0) {
          setPromptFocused(false);
        }
      }
      return;
    }

    if (key.tab) {
      // If a suggestion is highlighted, accept it
      if (showSuggestions && suggestionIdx >= 0 && suggestionIdx < candidates.length) {
        setPromptValue(`/${candidates[suggestionIdx]}`);
        setSuggestionIdx(-1);
        return;
      }
      if (promptValue) {
        const { completed, candidates: tabCandidates } = completeCommand(promptValue);
        setPromptValue(completed);
        setSuggestionIdx(-1);
        if (tabCandidates.length > 1) {
          useAppStore.getState().setPromptSuccess(tabCandidates.map((c) => `/${c}`).join('  '));
        }
      }
      return;
    }

    // Regular character input
    if (input && !key.escape && !key.return) {
      clearPromptFeedback();
      setPromptValue(promptValue + input);
      setSuggestionIdx(-1);
      if (!promptFocused) {
        setPromptFocused(true);
      }
    }
  });

  // Determine visible slice of suggestions
  const totalCandidates = candidates.length;
  let visibleStart = 0;
  if (totalCandidates > MAX_VISIBLE_SUGGESTIONS && suggestionIdx >= MAX_VISIBLE_SUGGESTIONS) {
    visibleStart = Math.min(
      suggestionIdx - MAX_VISIBLE_SUGGESTIONS + 1,
      totalCandidates - MAX_VISIBLE_SUGGESTIONS,
    );
  }
  const visibleCandidates = showSuggestions
    ? candidates.slice(visibleStart, visibleStart + MAX_VISIBLE_SUGGESTIONS)
    : [];
  const hasMoreAbove = visibleStart > 0;
  const hasMoreBelow = visibleStart + MAX_VISIBLE_SUGGESTIONS < totalCandidates;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text dimColor>{horizontalRule(Math.max(0, termWidth - 2))}</Text>
      {promptError && (
        <Text>
          <Text color={THEME.error}>✗</Text> <Text color={THEME.error}>{promptError}</Text>
        </Text>
      )}
      {promptSuccess && !promptError && (
        <Text>
          <Text color={THEME.success}>✓</Text> <Text color={THEME.success}>{promptSuccess}</Text>
        </Text>
      )}
      {showSuggestions && (
        <Box flexDirection="column">
          {hasMoreAbove && <Text dimColor> ↑ more</Text>}
          {visibleCandidates.map((cmd) => {
            const globalIdx = candidates.indexOf(cmd);
            const isSelected = globalIdx === suggestionIdx;
            const desc = COMMAND_DESCRIPTIONS[cmd as SlashCommand] ?? '';
            return (
              <Box key={cmd} gap={1}>
                <Text color={isSelected ? THEME.accent : undefined} bold={isSelected}>
                  {isSelected ? '▸' : ' '} /{cmd}
                </Text>
                <Text dimColor>{desc}</Text>
              </Box>
            );
          })}
          {hasMoreBelow && <Text dimColor> ↓ more</Text>}
        </Box>
      )}
      <Box>
        <Text color={promptFocused ? THEME.accent : THEME.muted}>{'❯ '}</Text>
        {promptValue ? <Text>{promptValue}</Text> : <Text dimColor>Type / for commands</Text>}
      </Box>
    </Box>
  );
}
