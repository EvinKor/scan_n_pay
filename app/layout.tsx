import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SplitLah — Receipt Splitter",
  description: "Scan receipts, split bills, pay via TNG",
  manifest: "/manifest.json",
  themeColor: "#00c896",
  icons: {
    icon: "/app_icon.png",
    apple: "/app_icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SplitLah",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/app_icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body suppressHydrationWarning>

        {children}
      </body>
    </html>
  );
}
