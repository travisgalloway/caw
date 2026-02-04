import type { DatabaseType } from '@caw/core';
import { createContext, useContext } from 'react';

export const DbContext = createContext<DatabaseType | null>(null);

export function useDb(): DatabaseType {
  const db = useContext(DbContext);
  if (!db) {
    throw new Error('useDb must be used within a DbContext.Provider');
  }
  return db;
}
