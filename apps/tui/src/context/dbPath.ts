import { createContext, useContext } from 'react';

export const DbPathContext = createContext<string | null>(null);

export function useDbPath(): string | null {
  return useContext(DbPathContext);
}
