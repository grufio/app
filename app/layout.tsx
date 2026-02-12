/**
 * Next.js root layout.
 *
 * Responsibilities:
 * - Load global styles and fonts.
 * - Define top-level HTML/body structure and metadata.
 */
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "./providers"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "gruf.io",
    template: "%s | gruf.io",
  },
  description: "gruf.io",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
