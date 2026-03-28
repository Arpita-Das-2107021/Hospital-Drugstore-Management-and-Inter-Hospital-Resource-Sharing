import { ReactNode } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/components/layout/LanguageToggle';
import { useScrollRestoration } from '@/hooks/use-scroll-restoration';
import { AppSidebar } from './AppSidebar';
import { LanguageToggle } from './LanguageToggle';
import { Bell, Search, MessageCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/ui/theme-toggle';

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export const AppLayout = ({ children, title, subtitle }: AppLayoutProps) => {
  const { isAuthenticated } = useAuth();
  const { t } = useLanguage();
  
  // Enable scroll restoration for all pages using this layout
  const { saveScrollPosition } = useScrollRestoration();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Handle navigation clicks to save scroll position before navigating
  const handleNavigationClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Check if the click is on a navigation link
    if (target.closest('a') || target.closest('[data-navigation]')) {
      saveScrollPosition();
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <AppSidebar />
      
      <div className="md:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 md:px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="pl-12 md:pl-0">
            {title && <h1 className="text-lg font-semibold text-foreground">{title}</h1>}
            {subtitle && <p className="text-sm text-muted-foreground hidden sm:block">{subtitle}</p>}
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('common.search')}
                className="w-40 sm:w-64 pl-9"
              />
            </div>
            <LanguageToggle />
            <ThemeToggle />
            <Button variant="ghost" size="icon" className="relative" asChild>
              <Link to="/messages">
                <MessageCircle className="h-5 w-5" />
                <Badge className="absolute -right-1 -top-1 h-5 min-w-[20px] px-1 text-xs" variant="secondary">
                  3
                </Badge>
              </Link>
            </Button>
            <Button variant="ghost" size="icon" className="relative" asChild>
              <Link to="/alerts">
                <Bell className="h-5 w-5" />
                <Badge className="absolute -right-1 -top-1 h-5 min-w-[20px] px-1 text-xs" variant="destructive">
                  5
                </Badge>
              </Link>
            </Button>
          </div>
        </header>

        {/* Main Content */}
        <main className="p-4 md:p-6 main-content" onClick={handleNavigationClick}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;