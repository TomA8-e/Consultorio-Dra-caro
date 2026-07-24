import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Consultorio Adri Caro",
  description: "Gestión privada de agenda e historias clínicas ginecológicas.",
};

const themeInitializationScript = `
(() => {
  const storageKey = "consultorio-theme";
  const validThemes = ["light", "dark", "system"];

  try {
    const storedTheme = localStorage.getItem(storageKey);
    const preference = validThemes.includes(storedTheme) ? storedTheme : "system";
    const resolvedTheme = preference === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preference;

    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = resolvedTheme;
  } catch {
    const resolvedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themePreference = "system";
    document.documentElement.style.colorScheme = resolvedTheme;
  }
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
