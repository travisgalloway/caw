import { Box, Text, useInput, useStdout } from 'ink';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { completeCommand } from '../utils/parseCommand';
import { horizontalRule, THEME } from '../utils/theme';

interface CommandPromptProps {
  onSubmit: (input: string) => void;
}

export function CommandPrompt({ onSubmit }: CommandPromptProps): React.JSX.Element {
  const promptValue = useAppStore((s) => s.promptValue);
  const promptFocused = useAppStore((s) => s.promptFocused);
  const promptError = useAppStore((s) => s.promptError);
  const promptSuccess = useAppStore((s) => s.promptSuccess);
  const { setPromptValue, setPromptFocused, clearPromptFeedback } = useAppStore();
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;

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

    // Arrow keys — ignore, let panel handlers deal with them
    if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return;

    if (key.escape) {
      setPromptValue('');
      setPromptFocused(false);
      clearPromptFeedback();
      return;
    }

    if (key.return) {
      if (promptValue) {
        onSubmit(promptValue);
        setPromptValue('');
        setPromptFocused(false);
      }
      return;
    }

    if (key.backspace || key.delete) {
      if (promptValue.length > 0) {
        const newValue = promptValue.slice(0, -1);
        setPromptValue(newValue);
        if (newValue.length === 0) {
          setPromptFocused(false);
        }
      }
      return;
    }

    if (key.tab) {
      if (promptValue) {
        const { completed, candidates } = completeCommand(promptValue);
        setPromptValue(completed);
        if (candidates.length > 1) {
          useAppStore.getState().setPromptSuccess(candidates.map((c) => `/${c}`).join('  '));
        }
      }
      return;
    }

    // Regular character input
    if (input && !key.escape && !key.return) {
      clearPromptFeedback();
      setPromptValue(promptValue + input);
      if (!promptFocused) {
        setPromptFocused(true);
      }
    }
  });

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
      <Box>
        <Text color={promptFocused ? THEME.accent : THEME.muted}>{'❯ '}</Text>
        {promptValue ? <Text>{promptValue}</Text> : <Text dimColor>Type / for commands</Text>}
      </Box>
    </Box>
  );
}
