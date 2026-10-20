import { defineConfig, loadEnv, type PluginOption } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command, mode }) => {
  // Vite only exposes VITE_* vars to the browser. Server code reads the rest
  // (SUPABASE_URL, OPENAI_API_KEY, …) from process.env, so load .env files into
  // it here. Real environment variables always win over .env values.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) process.env[key] ??= value;

  const plugins: PluginOption[] = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // src/server.ts wraps the default server entry with SSR error handling.
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    viteReact(),
  ];

  // Nitro packages the production server. It builds a standalone Node server by
  // default; set NITRO_PRESET (vercel, netlify, cloudflare-module, bun, …) to
  // target another platform. Vercel and Netlify are auto-detected in their CI.
  if (command === "build") plugins.push(nitro());

  return {
    plugins,
    resolve: {
      dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core"],
    },
    // Dev server only. Vite pre-bundles dependencies the first time it meets
    // them; meeting one late (the export libraries load on demand) makes it
    // re-bundle and force-reload the open page, which can leave the page on
    // its error screen. Listing them up front avoids the reload, and
    // ignoreOutdatedRequests keeps a reload that does happen from failing.
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/history",
        "@tanstack/router-core",
        "@tanstack/router-core/isServer",
        "@tanstack/router-core/ssr/client",
        "@tanstack/router-core/ssr/server",
        "seroval",
        "h3-v2",
        "pdfmake/build/pdfmake",
        "pdfmake/build/vfs_fonts",
        "docx",
        "pdfjs-dist",
        "mammoth/mammoth.browser",
      ],
      ignoreOutdatedRequests: true,
    },
    server: { port: Number(process.env["PORT"]) || 3000 },
  };
});
