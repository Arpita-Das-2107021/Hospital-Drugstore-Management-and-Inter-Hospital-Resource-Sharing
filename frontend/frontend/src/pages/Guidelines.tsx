import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FileCode,
  KeyRound,
  QrCode,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type ApiExample = {
  api: string;
  expectedResponse: string;
  note: string;
};

const apiExamples: ApiExample[] = [
  {
    api: 'POST /api/auth/login/',
    expectedResponse: `{
  "access": "jwt_access_token",
  "refresh": "jwt_refresh_token",
  "user": {
    "id": "dfb4a6d6-0ca5-4c57-b4ff-ef4189a9d2d3",
    "email": "ops@healthcare.org"
  }
}`,
    note: 'Use the access token in Authorization header for protected APIs.',
  },
  {
    api: 'POST /api/v1/requests/',
    expectedResponse: `{
  "id": "8cb0f00d-9ec4-4af7-a5aa-cfd4c8f77960",
  "status": "pending",
  "created_at": "2026-04-08T12:00:00Z"
}`,
    note: 'Creates a new healthcare resource request.',
  },
  {
    api: 'GET /api/v1/requests/{requestId}/',
    expectedResponse: `{
  "id": "8cb0f00d-9ec4-4af7-a5aa-cfd4c8f77960",
  "status": "approved",
  "dispatch_qr_code_url": "https://example.org/qr/8cb0f00d"
}`,
    note: 'Returns latest request status and dispatch details when available.',
  },
];

const workflowSteps = [
  {
    title: 'Request Resource',
    description: 'Create a request with item, quantity, urgency, and receiver information.',
    icon: ClipboardList,
  },
  {
    title: 'Approve Request',
    description: 'Authorized staff review availability and approve the request.',
    icon: UserCheck,
  },
  {
    title: 'Generate QR',
    description: 'Generate QR token for secure handoff and verification.',
    icon: QrCode,
  },
  {
    title: 'Dispatch',
    description: 'Record dispatch details and move resources to the receiver.',
    icon: ShieldCheck,
  },
  {
    title: 'Receive Confirmation',
    description: 'Receiver confirms delivery to complete the workflow.',
    icon: CheckCircle2,
  },
];

const Guidelines = () => {
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
              <p className="text-xs text-muted-foreground">User Manual</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
              <Link to="/">
                <ArrowLeft className="mr-1 h-4 w-4" />
                Homepage
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

      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Client guideline for healthcare organizations and small pharmacies
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Registration, API integration, non-API registration requirements, and workflow reference.
          </p>
        </section>

        <Tabs defaultValue="registration" className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-muted p-2 lg:grid-cols-4">
            <TabsTrigger value="registration" className="py-2">Registration Guide</TabsTrigger>
            <TabsTrigger value="api" className="py-2">API Integration</TabsTrigger>
            <TabsTrigger value="non-api" className="py-2">Non-API Integration</TabsTrigger>
            <TabsTrigger value="workflow" className="py-2">Usage Workflow</TabsTrigger>
          </TabsList>

          <TabsContent value="registration" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-xl">Required registration information</CardTitle>
                  <CardDescription>For healthcare providers and small pharmacies.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <ul className="list-disc space-y-1 pl-5">
                    <li>Organization name and service type</li>
                    <li>Healthcare or pharmacy license number</li>
                    <li>Authorized person name, email, and phone number</li>
                    <li>Address, region, and operating hours</li>
                    <li>Primary resource categories and stock scope</li>
                    <li>Preferred integration mode: API or Non-API</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-xl">Approval and first login</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <ol className="list-decimal space-y-1 pl-5">
                    <li>Submit registration form.</li>
                    <li>Platform review checks organization and license details.</li>
                    <li>Approved organizations receive activation instructions.</li>
                    <li>Create password and sign in from the login page.</li>
                  </ol>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="api" className="space-y-4">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <KeyRound className="h-5 w-5 text-primary" />
                  Authentication flow
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Call login API to receive access and refresh tokens.</li>
                  <li>Send access token in Authorization header for protected APIs.</li>
                  <li>Refresh tokens when expired and retry request.</li>
                </ol>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-3">
              {apiExamples.map((example) => (
                <Card key={example.api} className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileCode className="h-4 w-4 text-primary" />
                      {example.api}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>{example.note}</p>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
                        Expected response
                      </p>
                      <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs text-foreground">
{example.expectedResponse}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="non-api" className="space-y-4">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-xl">Small pharmacy non-API registration requirements</CardTitle>
                <CardDescription>Only registration requirements for non-API onboarding.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <ul className="list-disc space-y-1 pl-5">
                  <li>Small pharmacy legal name and license number</li>
                  <li>Owner or manager full name and national contact number</li>
                  <li>Official email and complete address</li>
                  <li>Operating hours and service region</li>
                  <li>Medicine categories and approximate stock range</li>
                  <li>Basic identity and license documents for verification</li>
                </ul>
                <p>
                  During registration, select Non-API Integration and complete the required profile fields.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="workflow" className="space-y-4">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-xl">Usage workflow</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {workflowSteps.map((step) => (
                  <div key={step.title} className="rounded-lg border border-border bg-muted/40 p-4">
                    <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <step.icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">{step.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Guidelines;