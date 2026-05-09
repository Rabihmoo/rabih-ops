import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Loader2 } from 'lucide-react';
import { signInWithMagicLink, useSession } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toaster';

const schema = z.object({ email: z.string().email('Enter a valid email address') });
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [sent, setSent] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  useEffect(() => {
    if (session) navigate('/', { replace: true });
  }, [session, navigate]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await signInWithMagicLink(values.email);
      setSent(true);
    } catch (err) {
      toast({
        title: 'Could not send magic link',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  });

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">Rabih Ops</CardTitle>
          <CardDescription>Sign in with a magic link sent to your email.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" /> Check your email
              </div>
              <p className="text-muted-foreground">
                We sent a sign-in link to <strong>{form.getValues('email')}</strong>. Open it on this
                device to continue.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 px-0"
                onClick={() => setSent(false)}
              >
                Use a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  {...form.register('email')}
                />
                {form.formState.errors.email ? (
                  <p className="text-destructive text-xs">
                    {form.formState.errors.email.message}
                  </p>
                ) : null}
              </div>
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                Send magic link
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
