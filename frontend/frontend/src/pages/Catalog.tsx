import { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Plus, Search, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { catalogApi } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

interface CatalogItem {
  id: string;
  name: string;
  resource_type: string;
  resource_type_display: string;
  description: string;
  unit: string;
  is_active: boolean;
  created_at: string;
}

interface ResourceType {
  value: string;
  label: string;
}

interface CatalogFormData {
  name: string;
  resource_type: string;
  description: string;
  unit: string;
}

const emptyForm: CatalogFormData = { name: '', resource_type: '', description: '', unit: '' };

export default function Catalog() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [types, setTypes] = useState<ResourceType[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<CatalogFormData>(emptyForm);

  const fetchItems = async () => {
    try {
      const params: Record<string, string> = {};
      if (typeFilter !== 'all') params.resource_type = typeFilter;
      const res = await catalogApi.getAll(params);
      const data = (res as unknown)?.data ?? res ?? {};
      const list: unknown[] = data?.results ?? (Array.isArray(data) ? data : []);
      setItems(list.map((i) => ({
        id: String(i.id ?? ''),
        name: i.name ?? '',
        resource_type: i.resource_type ?? '',
        resource_type_display: i.resource_type_name ?? i.resource_type_display ?? i.resource_type ?? '',
        description: i.description ?? '',
        unit: i.unit_of_measure ?? i.unit ?? '',
        is_active: i.is_active ?? true,
        created_at: i.created_at ?? '',
      })));
    } catch (err) {
      console.error('Failed to fetch catalog items:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const typesRes = await catalogApi.getTypes();
        const typesData = (typesRes as unknown)?.data ?? typesRes ?? [];
        const typesList: unknown[] = Array.isArray(typesData) ? typesData : typesData?.results ?? [];
        if (typesList.length > 0 && typeof typesList[0] === 'object') {
          setTypes(typesList.map((t) => ({ value: t.value ?? t.id, label: t.label ?? t.name })));
        } else if (typesList.length > 0 && typeof typesList[0] === 'string') {
          setTypes(typesList.map((t) => ({ value: t, label: t })));
        }
      } catch (err) {
        console.error('Failed to fetch resource types:', err);
      }
      await fetchItems();
    };
    init();
  }, []);

  useEffect(() => {
    if (!loading) {
      setLoading(true);
      fetchItems();
    }
  }, [typeFilter]);

  const openCreate = () => {
    setEditItem(null);
    setFormData(emptyForm);
    setShowDialog(true);
  };

  const openEdit = (item: CatalogItem) => {
    setEditItem(item);
    setFormData({
      name: item.name,
      resource_type: item.resource_type,
      description: item.description,
      unit: item.unit,
    });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!formData.name) return;
    setSubmitting(true);
    try {
      // Map 'unit' → 'unit_of_measure' for backend compatibility
      const payload = { ...formData, unit_of_measure: formData.unit };
      delete (payload as unknown).unit;
      if (editItem) {
        await catalogApi.update(editItem.id, payload);
        toast({ title: 'Item updated', description: `${formData.name} has been updated.` });
      } else {
        await catalogApi.create(payload);
        toast({ title: 'Item created', description: `${formData.name} has been added to catalog.` });
      }
      setShowDialog(false);
      setFormData(emptyForm);
      setEditItem(null);
      await fetchItems();
    } catch (err) {
      toast({ title: editItem ? 'Failed to update item' : 'Failed to create item', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await catalogApi.delete(deleteId);
      toast({ title: 'Item deleted' });
      setDeleteId(null);
      await fetchItems();
    } catch (err) {
      toast({ title: 'Failed to delete item', variant: 'destructive' });
    }
  };

  const filtered = items.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.resource_type_display.toLowerCase().includes(search.toLowerCase()) ||
      i.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout title="Resource Catalog"
      // subtitle="Manage the standard catalog of shareable resources"
    >
      <div className="flex-1 space-y-6 p-8 pt-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-6">
              <p className="text-2xl font-bold">{items.length}</p>
              <p className="text-sm text-muted-foreground">Total Items</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-2xl font-bold text-green-600">
                {items.filter((i) => i.is_active).length}
              </p>
              <p className="text-sm text-muted-foreground">Active Items</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-2xl font-bold">{types.length}</p>
              <p className="text-sm text-muted-foreground">Resource Types</p>
            </CardContent>
          </Card>
        </div>

        {/* Catalog Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Catalog Items</CardTitle>
                <CardDescription>Standard resources available for sharing</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={fetchItems}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search catalog..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {types.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No catalog items found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.resource_type_display}</TableCell>
                      <TableCell>{item.unit || '—'}</TableCell>
                      <TableCell className="max-w-xs truncate">{item.description || '—'}</TableCell>
                      <TableCell>
                        <Badge className={item.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                          {item.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeleteId(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create / Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editItem ? 'Edit Catalog Item' : 'Add Catalog Item'}</DialogTitle>
              <DialogDescription>
                {editItem ? 'Update the details for this resource.' : 'Add a new resource to the catalog.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Resource Type</Label>
                <Select
                  value={formData.resource_type}
                  onValueChange={(v) => setFormData({ ...formData, resource_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  placeholder="e.g. units, vials, litres"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || !formData.name}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editItem ? 'Save Changes' : 'Create Item'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Catalog Item</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this item? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
