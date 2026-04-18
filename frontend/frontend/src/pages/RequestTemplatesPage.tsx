import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect, useMemo } from 'react';
import { templatesApi } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  FileText,
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
} from 'lucide-react';

type UnknownRecord = Record<string, unknown>;

type TemplateRecord = {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  hospitalId: string;
};

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null;

const toTemplateRecord = (value: unknown): TemplateRecord | null => {
  if (!isRecord(value)) {
    return null;
  }

  const idValue = value.id ?? value.uuid ?? value.template_id;
  if (idValue == null) {
    return null;
  }

  const name = String(value.name ?? value.title ?? value.subject ?? 'Untitled template');
  const subject = String(value.subject ?? value.name ?? '');
  const body = String(value.body ?? value.message ?? value.content ?? '');

  return {
    id: String(idValue),
    name,
    subject,
    body,
    createdAt: value.created_at ? String(value.created_at) : '',
    updatedAt: value.updated_at ? String(value.updated_at) : '',
    hospitalId: value.hospital ? String(value.hospital) : value.hospital_id ? String(value.hospital_id) : '',
  };
};

const extractTemplateList = (payload: unknown): TemplateRecord[] => {
  let rawList: unknown[] = [];

  if (Array.isArray(payload)) {
    rawList = payload;
  } else if (isRecord(payload)) {
    const data = payload.data;
    if (Array.isArray(data)) {
      rawList = data;
    } else if (isRecord(data) && Array.isArray(data.results)) {
      rawList = data.results;
    } else if (Array.isArray(payload.results)) {
      rawList = payload.results;
    }
  }

  return rawList.map(toTemplateRecord).filter((item): item is TemplateRecord => item !== null);
};

const formatDate = (value: string): string => {
  if (!value) {
    return 'N/A';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'N/A';
  }

  return parsed.toLocaleDateString();
};

export default function RequestTemplatesPage() {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRecord | null>(null);
  const [apiTemplates, setApiTemplates] = useState<TemplateRecord[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', subject: '', body: '' });

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await templatesApi.getAll();
      setApiTemplates(extractTemplateList(res));
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleCreateTemplate = async () => {
    if (!newTemplate.name || !newTemplate.body) return;
    setCreating(true);
    try {
      await templatesApi.create({
        name: newTemplate.name,
        subject: newTemplate.subject || newTemplate.name,
        body: newTemplate.body,
      });
      toast({ title: 'Template created', description: `"${newTemplate.name}" has been saved.` });
      setShowCreateDialog(false);
      setNewTemplate({ name: '', subject: '', body: '' });
      await fetchTemplates();
    } catch {
      toast({ title: 'Failed to create template', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    try {
      await templatesApi.delete(id);
      toast({ title: 'Template deleted', description: `"${name}" has been removed.` });
      await fetchTemplates();
    } catch {
      toast({ title: 'Failed to delete template', variant: 'destructive' });
    }
  };

  const hospitalTemplateCount = useMemo(
    () => apiTemplates.filter((template) => Boolean(template.hospitalId)).length,
    [apiTemplates]
  );

  const lastUpdated = useMemo(() => {
    const candidates = apiTemplates
      .map((template) => template.updatedAt || template.createdAt)
      .filter((value) => value.length > 0)
      .map((value) => new Date(value).getTime())
      .filter((timestamp) => Number.isFinite(timestamp));

    if (candidates.length === 0) {
      return 'N/A';
    }

    const max = Math.max(...candidates);
    return new Date(max).toLocaleDateString();
  }, [apiTemplates]);

  const stats = [
    { label: 'Total Templates', value: String(apiTemplates.length), tone: 'text-primary' },
    { label: 'Hospital Templates', value: String(hospitalTemplateCount), tone: 'text-emerald-500' },
    { label: 'Last Updated', value: lastUpdated, tone: 'text-foreground' },
  ];

  return (
    <AppLayout title="Request Templates"
      // subtitle="Pre-configured templates to streamline resource requests"
    >
      <div className="space-y-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-gradient-to-br from-background via-background to-muted/40 p-6 sm:p-8">
          <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-8 h-52 w-52 rounded-full bg-emerald-500/10 blur-3xl" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Communication Toolkit</p>
              <h2 className="text-2xl font-semibold leading-tight sm:text-3xl">Reusable Request Templates</h2>
              <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                Build reusable message patterns for recurring inter-hospital requests.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={fetchTemplates}
                disabled={loadingTemplates}
                className="rounded-full border-border/70 bg-background/70 px-5"
              >
                <RefreshCw className={cn('mr-2 h-4 w-4', loadingTemplates && 'animate-spin')} />
                Refresh
              </Button>
              <Button onClick={() => setShowCreateDialog(true)} className="rounded-full px-5">
                <Plus className="mr-2 h-4 w-4" />
                Create Template
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map((item) => (
            <div
              key={item.label}
              className="flex min-h-24 items-center justify-between rounded-[999px] border border-border/60 bg-background/70 px-6 py-4 backdrop-blur"
            >
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className={cn('text-xl font-semibold sm:text-2xl', item.tone)}>{item.value}</p>
            </div>
          ))}
        </section>

        {loadingTemplates ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : apiTemplates.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>Saved Templates</span>
            </div>

            <div className="space-y-3">
              {apiTemplates.map((template) => (
                <article
                  key={template.id}
                  className="group relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-background/70 px-5 py-4 backdrop-blur-sm"
                >
                  <div className="absolute left-0 top-5 bottom-5 w-1 rounded-full bg-primary/40 transition-colors group-hover:bg-primary" />

                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2 lg:max-w-3xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold">{template.name}</h3>
                        <Badge variant="secondary" className="rounded-full">Template</Badge>
                        {template.hospitalId ? (
                          <Badge variant="outline" className="rounded-full">Hospital-owned</Badge>
                        ) : null}
                      </div>

                      {template.subject && template.subject !== template.name ? (
                        <p className="text-sm text-muted-foreground">Subject: {template.subject}</p>
                      ) : null}

                      <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                        {template.body || 'No content'}
                      </p>

                      <p className="text-xs text-muted-foreground">
                        Created: {formatDate(template.createdAt)}
                      </p>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        className="rounded-full px-4"
                        onClick={() => setSelectedTemplate(template)}
                      >
                        View Template
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full px-3"
                        onClick={() => handleDeleteTemplate(template.id, template.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section className="rounded-[2rem] border border-dashed border-border/70 bg-muted/25 py-16 text-center">
            <FileText className="mx-auto h-12 w-12 opacity-40" />
            <p className="mt-4 font-medium">No templates yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Create your first template to get started.</p>
            <Button onClick={() => setShowCreateDialog(true)} className="mt-5 rounded-full px-5">
              <Plus className="mr-2 h-4 w-4" />
              Create Template
            </Button>
          </section>
        )}

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-lg rounded-[1.75rem] border-border/70 p-0">
            <div className="space-y-5 p-6 sm:p-7">
              <DialogHeader>
                <DialogTitle>Create Message Template</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input
                    className="rounded-full"
                    placeholder="Template name"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input
                    className="rounded-full"
                    placeholder="Email subject (optional)"
                    value={newTemplate.subject}
                    onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Body *</Label>
                  <Textarea
                    className="min-h-28 rounded-3xl"
                    placeholder="Template content..."
                    rows={5}
                    value={newTemplate.body}
                    onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" className="rounded-full" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button
                  className="rounded-full"
                  onClick={handleCreateTemplate}
                  disabled={creating || !newTemplate.name || !newTemplate.body}
                >
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create Template
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!selectedTemplate} onOpenChange={(open) => !open && setSelectedTemplate(null)}>
          <DialogContent className="max-w-2xl rounded-[1.75rem] border-border/70">
            <DialogHeader>
              <DialogTitle>{selectedTemplate?.name || 'Template Preview'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {selectedTemplate?.subject ? (
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Subject</p>
                  <p className="mt-1 font-medium">{selectedTemplate.subject}</p>
                </div>
              ) : null}

              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Body</p>
                <div className="mt-2 whitespace-pre-wrap rounded-3xl border border-border/60 bg-muted/30 p-4 text-sm leading-relaxed">
                  {selectedTemplate?.body || 'No template body.'}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" className="rounded-full" onClick={() => setSelectedTemplate(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
