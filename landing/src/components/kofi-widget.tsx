'use client';

import Script from 'next/script';

type KofiWidgetOverlay = {
  draw: (account: string, config: Record<string, string>) => void;
};

// Ko-fi overlay attaches its global to window, which requires declaration merging. (Why)
declare global {
  interface Window {
    kofiWidgetOverlay?: KofiWidgetOverlay;
  }
}

// Ko-fi's floating "Support" button opening their donation overlay; lazyOnload
// keeps the third-party script off the critical path and draw runs on onLoad. (How / Why / What)
export function KofiWidget() {
  return (
    <Script
      src="https://storage.ko-fi.com/cdn/scripts/overlay-widget.js"
      strategy="lazyOnload"
      onLoad={() => {
        window.kofiWidgetOverlay?.draw('n2q1910', {
          type: 'floating-chat',
          'floating-chat.donateButton.text': 'Support KamehaDB',
          'floating-chat.donateButton.background-color': '#f59e0b',
          'floating-chat.donateButton.text-color': '#fff',
        });
      }}
    />
  );
}
