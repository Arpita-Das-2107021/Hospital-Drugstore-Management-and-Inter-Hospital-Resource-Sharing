import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import EmergencyBroadcast from '@/components/EmergencyBroadcast';
import { useState } from 'react';
import {
  Siren,
  AlertTriangle,
  Zap,
  Users,
  Heart,
  Clock,
  Phone,
  MessageSquare
} from 'lucide-react';

export default function EmergencyBroadcastPage() {
  const [showBroadcast, setShowBroadcast] = useState(false);

  const emergencyStats = [
    { label: 'Active Emergencies', value: '2', color: 'bg-red-100 text-red-800', urgent: true },
    { label: 'Hospitals in Network', value: '24', color: 'bg-blue-100 text-blue-800' },
    { label: 'Average Response Time', value: '4.2 min', color: 'bg-green-100 text-green-800' },
    { label: 'Last Broadcast', value: '18 min ago', color: 'bg-orange-100 text-orange-800' }
  ];

  const recentBroadcasts = [
    {
      id: 1,
      type: 'Mass Casualty',
      hospital: 'Dhaka Medical College',
      time: '18 minutes ago',
      status: 'active',
      responses: 8,
      targetArea: 'All Networks',
      scope: 24
    },
    {
      id: 2,
      type: 'Blood Shortage',
      hospital: 'Square Hospital',
      time: '2 hours ago', 
      status: 'resolved',
      responses: 12,
      targetArea: 'Dhaka City',
      scope: 6
    },
    {
      id: 3,
      type: 'Equipment Failure',
      hospital: 'Apollo Hospital',
      time: '5 hours ago',
      status: 'resolved',
      responses: 6,
      targetArea: 'Northeast Region',
      scope: 8
    }
  ];

  return (
    <AppLayout title="Emergency Broadcast Center" subtitle="Coordinate emergency responses across the healthcare network">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-end">
          <Button 
            size="lg" 
            className="bg-red-600 hover:bg-red-700 animate-pulse"
            onClick={() => setShowBroadcast(true)}
          >
            <Siren className="h-5 w-5 mr-2" />
            Emergency Broadcast
          </Button>
        </div>

        {/* Emergency Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {emergencyStats.map((stat, index) => (
            <Card key={index} className={stat.urgent ? 'border-red-200 bg-red-50' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                    <p className={`text-2xl font-bold ${stat.urgent ? 'text-red-600' : ''}`}>
                      {stat.value}
                    </p>
                  </div>
                  {stat.urgent && <AlertTriangle className="h-5 w-5 text-red-500" />}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-red-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center space-x-2">
                <Users className="h-5 w-5 text-red-600" />
                <span>Mass Casualty</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Alert network about multiple patient emergency
              </p>
              <Button 
                variant="destructive" 
                className="w-full"
                onClick={() => setShowBroadcast(true)}
              >
                <Siren className="h-4 w-4 mr-2" />
                Broadcast Alert
              </Button>
            </CardContent>
          </Card>

          <Card className="border-orange-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center space-x-2">
                <Heart className="h-5 w-5 text-orange-600" />
                <span>Critical Shortage</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Request immediate resource assistance
              </p>
              <Button 
                variant="outline" 
                className="w-full border-orange-200 text-orange-700"
                onClick={() => setShowBroadcast(true)}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Request Help
              </Button>
            </CardContent>
          </Card>

          <Card className="border-blue-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center space-x-2">
                <Zap className="h-5 w-5 text-blue-600" />
                <span>System Failure</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Report critical equipment or system failures
              </p>
              <Button 
                variant="outline" 
                className="w-full border-blue-200 text-blue-700"
                onClick={() => setShowBroadcast(true)}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Report Issue
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Recent Broadcasts */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Emergency Broadcasts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentBroadcasts.map((broadcast) => (
                <div key={broadcast.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${
                      broadcast.status === 'active' ? 'bg-red-500' : 'bg-green-500'
                    }`} />
                    <div>
                      <p className="font-medium">{broadcast.type}</p>
                      <p className="text-sm text-muted-foreground">
                        {broadcast.hospital} • {broadcast.time}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Target: {broadcast.targetArea} ({broadcast.scope} hospitals)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={broadcast.status === 'active' ? 'destructive' : 'secondary'}>
                      {broadcast.status}
                    </Badge>
                    <Badge variant="outline">
                      {broadcast.responses} responses
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Emergency Broadcast Modal */}
        <EmergencyBroadcast
          isOpen={showBroadcast}
          onClose={() => setShowBroadcast(false)}
          onBroadcast={(data) => {
            console.log('Emergency broadcast sent:', data);
            setShowBroadcast(false);
          }}
        />
      </div>
    </AppLayout>
  );
}