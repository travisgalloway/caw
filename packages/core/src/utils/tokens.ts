export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateObjectTokens(obj: object): number {
  return estimateTokens(JSON.stringify(obj));
}
