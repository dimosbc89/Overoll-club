// Vite/Vitest `?raw` imports (file contents as a string): tests read the
// copy deck and the brand SVGs this way, without Node types in the app build.
declare module '*?raw' {
  const content: string;
  export default content;
}
