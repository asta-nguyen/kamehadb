import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { KOFI_URL } from '@/lib/constants';

// Persistent footer link opening the project's Ko-fi page in the system
// browser, so donations happen outside the app webview. (How / Why / What)
export function SidebarDonateLink() {
  return (
    <div className="shrink-0 border-t border-border px-1.5 py-1">
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-muted-foreground hover:text-foreground"
        onClick={() => api.openBrowser(KOFI_URL)}
      >
        <Heart className="size-3.5 text-pink-500" />
        Support KamehaDB
      </Button>
    </div>
  );
}
