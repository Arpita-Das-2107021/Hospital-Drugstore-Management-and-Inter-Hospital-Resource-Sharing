import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect } from 'react';
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
import {
  FileText,
  TrendingUp,
  CheckCircle,
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
} from 'lucide-react';

export default function RequestTemplatesPage() {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<unknown | null>(null);
  const [apiTemplates, setApiTemplates] = useState<unknown[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', subject: '', body: '' });

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await templatesApi.getAll();
      const items = (res as unknown)?.data ?? (res as unknown)?.results ?? [];
      setApiTemplates(Array.isArray(items) ? items : []);
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

  return (
    <AppLayout title="Request Templates" subtitle="Pre-configured templates to streamline resource requests">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <Button variant="outline" size="sm" onClick={fetchTemplates} disabled={loadingTemplates}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingTemplates ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{apiTemplates.length}</p>
              <p className="text-sm text-muted-foreground">Total Templates</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">
                {apiTemplates.filter(t => t.hospital).length}
              </p>
              <p className="text-sm text-muted-foreground">Hospital Templates</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-purple-600">
                {apiTemplates[0]?.updated_at ? new Date(apiTemplates[0].updated_at).toLocaleDateString() : '�'}
              </p>
              <p className="text-sm text-muted-foreground">Last Updated</p>
            </CardContent>
          </Card>
        </div>

        {/* API Templates */}
        {loadingTemplates ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : apiTemplates.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="h-5 w-5" />
                <span>Saved Templates</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {apiTemplates.map((template) => (
                  <div key={template.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium">{template.name}</h3>
                        {template.subject && template.subject !== template.name && (
                          <p className="text-xs text-muted-foreground mt-1">{template.subject}</p>
                        )}
                      </div>
                      <Badge variant="secondary" className="ml-2 shrink-0">Template</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {template.body || 'No content'}
                    </p>
                    {template.created_at && (
                      <p className="text-xs text-muted-foreground">
                        Created: {new Date(template.created_at).toLocaleDateString()}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => setSelectedTemplate(template)}
                      >
                        View Template
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteTemplate(template.id, template.name)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mb-4 opacity-40" />
              <p className="font-medium mb-1">No templates yet</p>
              <p className="text-sm mb-4">Create your first template to get started</p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Template
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Performance Analytics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" />
              <span>Template Performance</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium">Templates help streamline requests</p>
                  <p className="text-sm text-muted-foreground">Use templates to save time on recurring resource requests</p>
                </div>
              </div>
              <Badge variant="secondary">{apiTemplates.length} templates</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Create Template Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Message Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  placeholder="Template name"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  placeholder="Email subject (optional)"
                  value={newTemplate.subject}
                  onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Body *</Label>
                <Textarea
                  placeholder="Template content..."
                  rows={4}
                  value={newTemplate.body}
                  onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button
                onClick={handleCreateTemplate}
                disabled={creating || !newTemplate.name || !newTemplate.body}
              >
                {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!selectedTemplate} onOpenChange={(open) => !open && setSelectedTemplate(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedTemplate?.name || 'Template Preview'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {selectedTemplate?.subject && (
                <div>
                  <p className="text-xs text-muted-foreground">Subject</p>
                  <p className="font-medium">{selectedTemplate.subject}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Body</p>
                <div className="rounded-md border p-3 whitespace-pre-wrap text-sm">
                  {selectedTemplate?.body || 'No template body.'}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedTemplate(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
