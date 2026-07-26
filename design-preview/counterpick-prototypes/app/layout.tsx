import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3001";
  const protocol = host.includes("localhost") || host.startsWith("127.") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;
  const title = "Counterpick — 5 UI directions";
  const description = "Интерактивные мобильные HTML-прототипы помощника по драфту Dota 2.";

  return {
    title,
    description,
    icons: {
      icon: "/brand/counterpick-mark.png",
      shortcut: "/brand/counterpick-mark.png",
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: `${baseUrl}/og.png`, width: 1672, height: 941, alt: "Counterpick — 5 UI directions" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${baseUrl}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
