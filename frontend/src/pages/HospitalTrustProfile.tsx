import { useState } from 'react';
import { useParams } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart
} from 'recharts';
import {
  Shield,
  Star,
  Clock,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Award,
  Users,
  Package,
  AlertTriangle,
  ExternalLink,
  Globe,
  Building2,
  Activity,
  Timer,
  Target,
  Zap
} from 'lucide-react';

// Mock data - in real app this would be fetched from API
const hospitalData = {
  id: 'hosp-001',
  name: 'Square Hospital Limited',
  type: 'Private Hospital',
  location: 'Panthapath, Dhaka',
  phone: '+88-02-8159547',
  email: 'info@squarehospital.com',
  website: 'https://squarehospital.com',
  established: '1999',
  totalBeds: 430,
  avatar: '/hospitals/square-hospital.jpg',
  
  // Trust Metrics
  verificationStatus: 'verified',
  trustScore: 4.7,
  responseTime: '2.3 hours',
  fulfillmentRate: 94,
  totalTransactions: 156,
  successfulDeliveries: 147,
  
  // Accreditations
  accreditations: [
    { name: 'JCI Accredited', issuer: 'Joint Commission International', year: '2023' },
    { name: 'ISO 9001:2015', issuer: 'ISO', year: '2022' },
    { name: 'BMDC Licensed', issuer: 'Bangladesh Medical Council', year: '2024' }
  ],
  
  // Recent Activity
  recentTransactions: [
    {
      id: 'TXN-001',
      type: 'provided',
      resource: 'Amoxicillin 500mg',
      quantity: '100 units',
      hospital: 'Dhaka Medical College',
      date: '2024-12-30',
      status: 'completed',
      responseTime: '1.2 hours'
    },
    {
      id: 'TXN-002',
      type: 'received',
      resource: 'O-Negative Blood',
      quantity: '2 units',
      hospital: 'NICVD',
      date: '2024-12-29',
      status: 'completed',
      responseTime: '0.8 hours'
    },
    {
      id: 'TXN-003',
      type: 'provided',
      resource: 'Ventilator',
      quantity: '1 unit',
      hospital: 'Apollo Hospital',
      date: '2024-12-28',
      status: 'completed',
      responseTime: '3.1 hours'
    }
  ],
  
  // Performance Stats
  performanceStats: {
    last30Days: {
      requestsReceived: 23,
      requestsFulfilled: 21,
      averageResponseTime: '2.1 hours',
      resourcesShared: 45,
      hospitalsHelped: 8
    },
    last6Months: {
      totalShared: 234,
      emergencyRequests: 18,
      emergencyFulfillment: 100,
      repeatPartners: 12
    }
  },
  
  // Available Resources Summary
  availableResources: [
    { category: 'Medications', count: 45, critical: 3 },
    { category: 'Blood Products', count: 12, critical: 1 },
    { category: 'Equipment', count: 8, critical: 0 },
    { category: 'Supplies', count: 67, critical: 5 }
  ]
};

export default function HospitalTrustProfile() {
  const { hospitalId } = useParams();
  const [hospital] = useState(hospitalData); // In real app, fetch based on hospitalId
  
  const getTrustBadgeColor = (score: number) => {
    if (score >= 4.5) return 'bg-green-100 text-green-800 border-green-300';
    if (score >= 4.0) return 'bg-blue-100 text-blue-800 border-blue-300';
    if (score >= 3.5) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-red-100 text-red-800 border-red-300';
  };

  const renderStarRating = (rating: number) => {
    return (
      <div className="flex items-center space-x-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
            }`}
          />
        ))}
        <span className="ml-2 text-sm font-medium">{rating}</span>
      </div>
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <AppLayout title="Hospital Trust Profile" subtitle={`${hospital.name} - Trust metrics and verification status`}>
      <div className="flex-1 space-y-6 p-8 pt-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={hospital.avatar} alt={hospital.name} />
              <AvatarFallback>
                {hospital.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-bold">{hospital.name}</h1>
                {hospital.verificationStatus === 'verified' && (
                  <Badge className="bg-green-100 text-green-800 border-green-300">
                    <Shield className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground">{hospital.type}</p>
              <div className="flex items-center space-x-4 mt-2">
                <div className="flex items-center space-x-1 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{hospital.location}</span>
                </div>
                <div className="flex items-center space-x-1 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>Est. {hospital.established}</span>
                </div>
                <div className="flex items-center space-x-1 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{hospital.totalBeds} beds</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex space-x-2">
            <Button variant="outline" onClick={() => window.open(`tel:${hospital.phone}`)}>
              <Phone className="h-4 w-4 mr-2" />
              Call
            </Button>
            <Button variant="outline" onClick={() => window.open(`mailto:${hospital.email}`)}>
              <Mail className="h-4 w-4 mr-2" />
              Email
            </Button>
            <Button onClick={() => window.open(hospital.website, '_blank')}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Website
            </Button>
          </div>
        </div>

        {/* Trust Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="flex items-center p-6">
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Star className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{hospital.trustScore}</p>
                  <p className="text-sm text-muted-foreground">Trust Score</p>
                  {renderStarRating(hospital.trustScore)}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center p-6">
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{hospital.fulfillmentRate}%</p>
                  <p className="text-sm text-muted-foreground">Fulfillment Rate</p>
                  <p className="text-xs text-green-600">
                    {hospital.successfulDeliveries}/{hospital.totalTransactions} completed
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center p-6">
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Clock className="h-6 w-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{hospital.responseTime}</p>
                  <p className="text-sm text-muted-foreground">Avg Response</p>
                  <p className="text-xs text-muted-foreground">Usually responds quickly</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center p-6">
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{hospital.totalTransactions}</p>
                  <p className="text-sm text-muted-foreground">Total Transactions</p>
                  <p className="text-xs text-purple-600">Active contributor</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transactions">Transaction History</TabsTrigger>
            <TabsTrigger value="resources">Available Resources</TabsTrigger>
            <TabsTrigger value="credentials">Credentials</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Performance Stats */}
              <Card>
                <CardHeader>
                  <CardTitle>Performance (Last 30 Days)</CardTitle>
                  <CardDescription>
                    Recent activity and sharing statistics
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-2xl font-bold text-blue-600">
                        {hospital.performanceStats.last30Days.requestsReceived}
                      </p>
                      <p className="text-sm text-muted-foreground">Requests Received</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-600">
                        {hospital.performanceStats.last30Days.requestsFulfilled}
                      </p>
                      <p className="text-sm text-muted-foreground">Requests Fulfilled</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-purple-600">
                        {hospital.performanceStats.last30Days.resourcesShared}
                      </p>
                      <p className="text-sm text-muted-foreground">Resources Shared</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-orange-600">
                        {hospital.performanceStats.last30Days.hospitalsHelped}
                      </p>
                      <p className="text-sm text-muted-foreground">Hospitals Helped</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>
                    Latest resource sharing transactions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {hospital.recentTransactions.slice(0, 4).map((transaction) => (
                      <div key={transaction.id} className="flex items-center space-x-3">
                        <div className={`h-2 w-2 rounded-full ${
                          transaction.type === 'provided' ? 'bg-green-500' : 'bg-blue-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            {transaction.type === 'provided' ? 'Provided' : 'Received'} {transaction.resource}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {transaction.type === 'provided' ? 'to' : 'from'} {transaction.hospital} • {transaction.responseTime} response
                          </p>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(transaction.date).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Transaction History</CardTitle>
                <CardDescription>
                  Complete history of resource sharing activities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {hospital.recentTransactions.map((transaction) => (
                    <div key={transaction.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className={`p-2 rounded-lg ${
                          transaction.type === 'provided' ? 'bg-green-100' : 'bg-blue-100'
                        }`}>
                          <Package className={`h-4 w-4 ${
                            transaction.type === 'provided' ? 'text-green-600' : 'text-blue-600'
                          }`} />
                        </div>
                        <div>
                          <p className="font-medium">{transaction.resource}</p>
                          <p className="text-sm text-muted-foreground">
                            {transaction.quantity} • {transaction.type === 'provided' ? 'Provided to' : 'Received from'} {transaction.hospital}
                          </p>
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <Badge className={getStatusColor(transaction.status)}>
                          {transaction.status}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          Response: {transaction.responseTime}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(transaction.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="resources" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {hospital.availableResources.map((category) => (
                <Card key={category.category}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{category.category}</p>
                        <p className="text-2xl font-bold text-blue-600">{category.count}</p>
                        <p className="text-sm text-muted-foreground">Available</p>
                      </div>
                      {category.critical > 0 && (
                        <div className="text-right">
                          <div className="flex items-center space-x-1 text-red-600">
                            <AlertTriangle className="h-4 w-4" />
                            <span className="text-sm font-medium">{category.critical}</span>
                          </div>
                          <p className="text-xs text-red-600">Critical</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="credentials" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Accreditations & Certifications</CardTitle>
                <CardDescription>
                  Official certifications and accreditations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {hospital.accreditations.map((accreditation, index) => (
                    <div key={index} className="flex items-center space-x-3 p-4 border rounded-lg">
                      <Award className="h-8 w-8 text-yellow-600" />
                      <div>
                        <p className="font-medium">{accreditation.name}</p>
                        <p className="text-sm text-muted-foreground">{accreditation.issuer}</p>
                        <p className="text-xs text-muted-foreground">Valid {accreditation.year}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}