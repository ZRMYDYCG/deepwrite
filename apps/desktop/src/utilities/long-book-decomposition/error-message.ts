export function decompositionErrorMessage(error: unknown, fallback: string) {
  return (error instanceof Error ? error.message : fallback).slice(0, 2000);
}
