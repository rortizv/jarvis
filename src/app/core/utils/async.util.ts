/** Retorna una promesa que se resuelve tras `ms` milisegundos. Útil con async/await. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
