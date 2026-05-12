import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { cn } from '@/lib/utils';
import { subscribeToast, type ToastMessage } from './toast';

export function Toaster() {
  const [messages, setMessages] = React.useState<ToastMessage[]>([]);

  React.useEffect(() => {
    return subscribeToast((t) => {
      setMessages((prev) => [...prev, t]);
      setTimeout(
        () => setMessages((prev) => prev.filter((m) => m.id !== t.id)),
        4000,
      );
    });
  }, []);

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {messages.map((m) => (
        <ToastPrimitive.Root
          key={m.id}
          className={cn(
            'bg-card text-card-foreground border-border data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=open]:slide-in-from-top-full data-[state=closed]:slide-out-to-right-full grid grid-cols-[auto,1fr] items-center gap-2 rounded-md border p-3 shadow-lg',
            m.variant === 'destructive' && 'bg-destructive text-destructive-foreground border-destructive',
          )}
        >
          <div className="col-span-2">
            <ToastPrimitive.Title className="text-sm font-semibold">{m.title}</ToastPrimitive.Title>
            {m.description ? (
              <ToastPrimitive.Description className="text-muted-foreground mt-1 text-xs">
                {m.description}
              </ToastPrimitive.Description>
            ) : null}
          </div>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[60] m-4 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2" />
    </ToastPrimitive.Provider>
  );
}
