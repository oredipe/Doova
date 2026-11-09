import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const archivo = localFont({
  src: [
    { path: "../fonts/archivo-latin-400-normal.woff2", weight: "400" },
    { path: "../fonts/archivo-latin-500-normal.woff2", weight: "500" },
    { path: "../fonts/archivo-latin-600-normal.woff2", weight: "600" },
    { path: "../fonts/archivo-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Doova", template: "%s · Doova" },
  description: "Real tasks, real pay. The money is locked before anyone starts.",
  applicationName: "Doova",
  appleWebApp: { capable: true, title: "Doova", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#F6F6F1",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-NG" className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
