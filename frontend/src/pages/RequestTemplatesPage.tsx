import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import GuidedRequestTemplate from '@/components/GuidedRequestTemplate';
import { useState } from 'react';
import {
  FileText,
  Droplets,
  Wind,
  Heart,
  Pill,
  Stethoscope,
  Package,
  Clock,
  TrendingUp,
  CheckCircle,
  Star
} from 'lucide-react';

export default function RequestTemplatesPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const templateStats = [
    { label: 'Total Templates', value: '6', color: 'text-blue-600' },
    { label: 'Most Used', value: 'Blood Request', color: 'text-green-600' },
    { label: 'Success Rate', value: '94.2%', color: 'text-purple-600' },
    { label: 'Avg Response Time', value: '2.4h', color: 'text-orange-600' }
  ];

  const templates = [
    {
      id: 'blood-request',
      name: 'Blood Products Request',
      icon: <Droplets className="h-8 w-8 text-red-500" />,
      description: 'Request blood units, plasma, platelets, or other blood products',
      usage: 89,
      successRate: 96,
      avgTime: '1.5 hours',
      category: 'Critical Care',
      lastUsed: '2 hours ago'
    },
    {
      id: 'oxygen-request',
      name: 'Oxygen & Ventilation',
      icon: <Wind className="h-8 w-8 text-blue-500" />,
      description: 'Request oxygen cylinders, concentrators, or ventilation equipment',
      usage: 76,
      successRate: 92,
      avgTime: '2.1 hours',
      category: 'Respiratory',
      lastUsed: '5 hours ago'
    },
    {
      id: 'ventilator-request',
      name: 'Ventilator & Critical Care',
      icon: <Heart className="h-8 w-8 text-purple-500" />,
      description: 'Request ventilators, monitors, or critical care equipment',
      usage: 45,
      successRate: 88,
      avgTime: '3.2 hours',
      category: 'Equipment',
      lastUsed: '1 day ago'
    },
    {
      id: 'medication-request',
      name: 'Medications & Pharmaceuticals',
      icon: <Pill className="h-8 w-8 text-green-500" />,
      description: 'Request specific medications, antibiotics, or controlled substances',
      usage: 134,
      successRate: 91,
      avgTime: '4.1 hours',
      category: 'Pharmacy',
      lastUsed: '30 minutes ago'
    },
    {
      id: 'surgical-request',
      name: 'Surgical Equipment & Supplies',
      icon: <Stethoscope className="h-8 w-8 text-orange-500" />,
      description: 'Request surgical instruments, implants, or operating room supplies',
      usage: 67,
      successRate: 93,
      avgTime: '2.8 hours',
      category: 'Surgery',
      lastUsed: '4 hours ago'
    },
    {
      id: 'diagnostic-request',
      name: 'Diagnostic Equipment',
      icon: <Package className="h-8 w-8 text-indigo-500" />,
      description: 'Request imaging equipment, laboratory instruments, or diagnostic tools',
      usage: 32,
      successRate: 89,
      avgTime: '5.5 hours',
      category: 'Diagnostics',
      lastUsed: '2 days ago'
    }
  ];

  const getUsageColor = (usage: number) => {
    if (usage > 100) return 'text-green-600';
    if (usage > 50) return 'text-yellow-600';
    return 'text-gray-600';
  };

  return (
    <AppLayout title="Request Templates" subtitle="Pre-configured templates to streamline resource requests">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-end">
          <Button>
            <FileText className="h-4 w-4 mr-2" />
            Create Custom Template
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {templateStats.map((stat, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <p className={`text-2xl font-bold ${stat.color}`}>
                    {stat.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Template Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <Card key={template.id} className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    {template.icon}
                    <div>
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <Badge variant="secondary" className="mt-1">
                        {template.category}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {template.description}
                </p>
                
                {/* Performance Metrics */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Usage (30 days)</span>
                    <span className={`font-semibold ${getUsageColor(template.usage)}`}>
                      {template.usage} times
                    </span>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Success Rate</span>
                      <span className="font-semibold text-green-600">
                        {template.successRate}%
                      </span>
                    </div>
                    <Progress value={template.successRate} className="h-2" />
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Avg Response</span>
                    <span className="font-semibold flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      {template.avgTime}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Last Used</span>
                    <span className="text-sm">{template.lastUsed}</span>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex space-x-2 pt-2">
                  <Button 
                    className="flex-1" 
                    onClick={() => setSelectedTemplate(template.id)}
                  >
                    Use Template
                  </Button>
                  <Button variant="outline" size="icon">
                    <Star className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Usage Analytics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" />
              <span>Template Performance</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium">High Performance Templates</p>
                    <p className="text-sm text-muted-foreground">Templates with &gt;90% success rate</p>
                  </div>
                </div>
                <Badge variant="secondary">4 templates</Badge>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">2.4h</p>
                  <p className="text-sm text-muted-foreground">Average Response Time</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-2xl font-bold text-green-600">94.2%</p>
                  <p className="text-sm text-muted-foreground">Overall Success Rate</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-2xl font-bold text-purple-600">443</p>
                  <p className="text-sm text-muted-foreground">Total Uses (30 days)</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Template Modal */}
        {selectedTemplate && (
          <GuidedRequestTemplate
            isOpen={!!selectedTemplate}
            onClose={() => setSelectedTemplate(null)}
            onSubmit={(data) => {
              console.log('Template request submitted:', data);
              setSelectedTemplate(null);
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}