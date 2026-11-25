/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Ship the copyright notices of bundled packages with every build.
  build: { license: { fileName: "third-party-licenses.txt" } },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
