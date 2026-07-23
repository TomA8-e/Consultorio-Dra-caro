import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Consultorio Adri Caro",
  description: "Gestión privada de agenda e historias clínicas ginecológicas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
