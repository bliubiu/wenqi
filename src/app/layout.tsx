import type { Metadata } from 'next';
import { ErrorBoundary } from '@/presentation/components/ErrorBoundary';
import './globals.css';

export const metadata: Metadata = {
  title: '文气 - 观文气之聚散，见千年之脉络',
  description: '沉浸式古典文学知识探索应用，以三维星系可视化呈现千年文脉',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="font-sans antialiased">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
