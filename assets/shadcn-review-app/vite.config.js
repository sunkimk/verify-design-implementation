import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {resolve} from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {alias: {"@": resolve(import.meta.dirname, "./src")}},
  base: "./",
  build: {
    // Must stay inside the package: this resolved to a sibling of the installed Skill directory and
    // emptyOutDir would then wipe whatever happened to be there.
    outDir: "dist",
    emptyOutDir: true,
  },
});
