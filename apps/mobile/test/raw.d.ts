// Vite/Vitest `?raw` imports (file contents as a string): tests read the
// copy deck and the brand SVGs this way, without Node types in the app build.
declare module '*?raw' {
  const content: string;
  export default content;
}

// Vite/Vitest `import.meta.glob` (eager): tests list repo files this way, again
// without Node types in the app build.
interface ImportMeta {
  glob<T = unknown>(pattern: string, options: { eager: true; import?: string }): Record<string, T>;
}
