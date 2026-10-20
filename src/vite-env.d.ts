/// <reference types="vite/client" />

// The browser build of mammoth ships without type declarations.
declare module "mammoth/mammoth.browser" {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
}
