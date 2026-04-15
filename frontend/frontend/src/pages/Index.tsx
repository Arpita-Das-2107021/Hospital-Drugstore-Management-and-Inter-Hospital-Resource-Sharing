import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BookOpen,
  Boxes,
  ClipboardCheck,
  Gauge,
  Package,
  PhoneCall,
  ShieldCheck,
  Share2,
  Truck,
} from 'lucide-react';
import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type FeatureCard = {
  title: string;
  description: string;
  icon: LucideIcon;
};

const featureCards: FeatureCard[] = [
  {
    title: 'Inventory Visibility',
    description:
      'Track stock levels, expiry windows, and movement trends in one workspace.',
    icon: Package,
  },
  {
    title: 'Inter-Healthcare Resource Sharing',
    description:
      'Share critical resources between healthcare organizations using structured requests.',
    icon: Share2,
  },
  {
    title: 'Secure Workflow Governance',
    description:
      'Use role-based approvals and audit trails for safer operational decisions.',
    icon: ShieldCheck,
  },
  {
    title: 'Faster Shortage Response',
    description:
      'Identify shortages quickly and coordinate supply actions without delays.',
    icon: Gauge,
  },
  {
    title: 'Drugstore Operations',
    description:
      'Manage medicine catalogs, stock updates, and issue tracking for daily operations.',
    icon: Boxes,
  },
  {
    title: 'Dispatch and Receipt Tracking',
    description:
      'Track dispatch, transfer, and confirmation states from request to completion.',
    icon: Truck,
  },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">HealthSync</p>
              <p className="text-xs text-muted-foreground">Healthcare Resource Platform</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link to="/guidelines">
                <BookOpen className="mr-2 h-4 w-4" />
                User Manual
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/login">Login</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/register">Register</Link>
            </Button>
            <div className="ml-1 flex items-center rounded-md border border-border bg-card px-1">
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center gap-2 text-primary">
            <ClipboardCheck className="h-5 w-5" />
            <p className="text-sm font-medium">Project Features</p>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Healthcare resource sharing and drugstore management
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Built for healthcare organizations and small pharmacies.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featureCards.map((feature) => (
              <Card key={feature.title} className="border-border bg-card">
                <CardHeader className="pb-2">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <footer className="mt-8 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} HealthSync</p>
          <div className="flex items-center gap-4">
            <Link className="font-medium text-primary hover:underline" to="/guidelines">
              User Manual
            </Link>
            <a className="font-medium text-primary hover:underline" href="mailto:support@healthsync.local">
              <PhoneCall className="mr-1 inline h-4 w-4" />
              Support
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default Index;
