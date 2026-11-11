import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "نوا — دستیار هوشمند فروشگاه",
  description:
    "دستیار هوشمند فروشگاه نوا؛ به سوال‌های شما درباره ارسال، مرجوعی، گارانتی و سایزبندی از روی اسناد رسمی پاسخ می‌دهد",
  applicationName: "نوا",
  icons: {
    icon: "/brand/nova-icon.png",
    apple: "/brand/nova-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1816" },
  ],
};

const themeInitScript = `
(function(){
  try {
    var t = localStorage.getItem('nova-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
