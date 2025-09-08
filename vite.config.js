import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl"; // <-- Add this line

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()], // <-- Add basicSsl() here
  server: {
    https: true, // <-- Add this line
  },
});
