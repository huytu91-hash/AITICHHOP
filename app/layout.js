import "./globals.css";

export const metadata = {
  title: "AI Software Factory",
  description: "AI coding workspace with provider routing, fallback and live project workflow.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
