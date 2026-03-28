import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  AreaChart,
  Area
} from 'recharts';
import {
  Coins,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Clock,
  AlertTriangle,
  Plus,
  Minus,
  RotateCcw,
  CreditCard,
  Handshake,
  Calculator,
  Award,
  Target,
  BarChart3,
  PieChart as PieChartIcon,
  Zap,
  Users
} from 'lucide-react';

// Enhanced mock data for Phase 2 analytics
const creditBalance = {
  total: 2350,
  available: 1890,
  pending: 460,
  reserved: 0,
  monthlyTrend: [
    { month: 'Jul', credits: 1890, debits: 1240, net: 650 },
    { month: 'Aug', credits: 2150, debits: 1450, net: 700 },
    { month: 'Sep', credits: 1980, debits: 1680, net: 300 },
    { month: 'Oct', credits: 2340, debits: 1290, net: 1050 },
    { month: 'Nov', credits: 2180, debits: 1520, net: 660 },
    { month: 'Dec', credits: 2450, debits: 1100, net: 1350 }
  ]
};

const reciprocityMetrics = {
  totalNetworkValue: 15680000, // BDT
  monthlyVolume: 2840000,
  averageResponseTime: 2.4, // hours
  fulfillmentRate: 94.2, // percentage
  networkEfficiency: 87.5, // percentage
  costSavings: 1240000 // BDT saved through sharing
};

const riskAnalysis = [
  {
    category: 'High-Risk Partners',
    count: 3,
    risk: 'high',
    description: 'Partners with negative balance > 30 days',
    action: 'Credit limit review required'
  },
  {
    category: 'Overexposed Credits',
    count: 2,
    risk: 'medium',
    description: 'Single partner exposure > 15% of portfolio',
    action: 'Diversification recommended'
  },
  {
    category: 'Inactive Partners',
    count: 7,
    risk: 'low',
    description: 'No transactions in 90+ days',
    action: 'Engagement outreach needed'
  }
];

const valueFlowData = [
  { partner: 'DMCH', inbound: 1200, outbound: 800, net: 400 },
  { partner: 'Apollo', inbound: 600, outbound: 900, net: -300 },
  { partner: 'Square', inbound: 400, outbound: 1100, net: 700 },
  { partner: 'United', inbound: 800, outbound: 450, net: 350 },
  { partner: 'Holy Family', inbound: 300, outbound: 650, net: 350 }
];

const recentTransactions = [
  {
    id: 'TXN-2024-001',
    date: '2024-12-30',
    type: 'credit',
    hospital: 'Dhaka Medical College',
    description: 'Provided: Amoxicillin 500mg (100 units)',
    amount: +250,
    status: 'completed',
    transactionId: 'REQ-2024-0456'
  },
  {
    id: 'TXN-2024-002',
    date: '2024-12-29',
    type: 'debit',
    hospital: 'Apollo Hospital',
    description: 'Received: O-Negative Blood (2 units)',
    amount: -400,
    status: 'completed',
    transactionId: 'REQ-2024-0455'
  },
  {
    id: 'TXN-2024-003',
    date: '2024-12-28',
    type: 'credit',
    hospital: 'Square Hospital',
    description: 'Provided: Ventilator (48 hours)',
    amount: +800,
    status: 'pending',
    transactionId: 'REQ-2024-0454'
  },
  {
    id: 'TXN-2024-004',
    date: '2024-12-27',
    type: 'debit',
    hospital: 'United Hospital',
    description: 'Received: Insulin (50 vials)',
    amount: -180,
    status: 'completed',
    transactionId: 'REQ-2024-0453'
  }
];

const partnerBalances = [
  {
    hospital: 'Dhaka Medical College',
    balance: +420,
    transactions: 23,
    lastActivity: '2024-12-30',
    trustLevel: 'excellent',
    creditLimit: 1000
  },
  {
    hospital: 'Apollo Hospital',
    balance: -230,
    transactions: 15,
    lastActivity: '2024-12-29',
    trustLevel: 'good',
    creditLimit: 800
  },
  {
    hospital: 'Square Hospital',
    balance: +650,
    transactions: 31,
    lastActivity: '2024-12-28',
    trustLevel: 'excellent',
    creditLimit: 1200
  },
  {
    hospital: 'United Hospital',
    balance: -120,
    transactions: 12,
    lastActivity: '2024-12-27',
    trustLevel: 'good',
    creditLimit: 600
  },
  {
    hospital: 'NICVD',
    balance: +340,
    transactions: 19,
    lastActivity: '2024-12-26',
    trustLevel: 'very-good',
    creditLimit: 900
  }
];

const settlementOptions = [
  {
    id: 'monthly-auto',
    name: 'Monthly Auto-Settlement',
    description: 'Automatic settlement of balances at month end',
    enabled: true,
    threshold: 500
  },
  {
    id: 'threshold-based',
    name: 'Threshold-Based Settlement',
    description: 'Settle when balance exceeds threshold',
    enabled: false,
    threshold: 1000
  },
  {
    id: 'manual-only',
    name: 'Manual Settlement Only',
    description: 'All settlements require manual approval',
    enabled: false,
    threshold: null
  }
];

export default function CreditLedger() {
  const [selectedPeriod, setSelectedPeriod] = useState('current-month');
  const [showSettlementDialog, setShowSettlementDialog] = useState(false);
  const [settlementAmount, setSettlementAmount] = useState('');
  const [selectedHospital, setSelectedHospital] = useState<typeof partnerBalances[0] | null>(null);

  const getTrustColor = (trustLevel: string) => {
    switch (trustLevel) {
      case 'excellent': return 'bg-green-100 text-green-800 border-green-300';
      case 'very-good': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'good': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'fair': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'poor': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return 'text-green-600';
    if (balance < 0) return 'text-red-600';
    return 'text-gray-600';
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
    <AppLayout title="Credit & Reciprocity Ledger" subtitle="Manage resource sharing credits and partner balances">
      <div className="flex-1 space-y-6 p-8 pt-6">
        <div className="flex justify-end">
          <Button onClick={() => setShowSettlementDialog(true)}>
            <Calculator className="h-4 w-4 mr-2" />
            Settle Balances
          </Button>
        </div>

        {/* Credit Balance Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="flex items-center p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Coins className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{creditBalance.total.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Total Credits</p>
                  <p className="text-xs text-green-600 flex items-center">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    +12% this month
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <CreditCard className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{creditBalance.available.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Available Credits</p>
                  <p className="text-xs text-muted-foreground">
                    Ready for use
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-yellow-100 rounded-lg">
                  <Clock className="h-6 w-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{creditBalance.pending.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Pending Credits</p>
                  <p className="text-xs text-yellow-600">
                    Awaiting confirmation
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Handshake className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{partnerBalances.length}</p>
                  <p className="text-sm text-muted-foreground">Active Partners</p>
                  <p className="text-xs text-purple-600">
                    Sharing network
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="transactions" className="space-y-6">
          <TabsList>
            <TabsTrigger value="transactions">Recent Transactions</TabsTrigger>
            <TabsTrigger value="partners">Partner Balances</TabsTrigger>
            <TabsTrigger value="settlements">Settlement Management</TabsTrigger>
          </TabsList>

          {/* Recent Transactions */}
          <TabsContent value="transactions" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Transaction History</CardTitle>
                    <CardDescription>
                      Recent credit and debit transactions with partner hospitals
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentTransactions.map((transaction) => (
                    <div 
                      key={transaction.id} 
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex items-center space-x-4">
                        <div className={`p-2 rounded-lg ${
                          transaction.type === 'credit' ? 'bg-green-100' : 'bg-blue-100'
                        }`}>
                          {transaction.type === 'credit' ? (
                            <Plus className="h-4 w-4 text-green-600" />
                          ) : (
                            <Minus className="h-4 w-4 text-blue-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{transaction.hospital}</p>
                          <p className="text-sm text-muted-foreground">{transaction.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(transaction.date).toLocaleDateString()} • ID: {transaction.transactionId}
                          </p>
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <p className={`font-bold ${getBalanceColor(transaction.amount)}`}>
                          {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString()}
                        </p>
                        <Badge className={getStatusColor(transaction.status)}>
                          {transaction.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Partner Balances */}
          <TabsContent value="partners" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Partner Credit Balances</CardTitle>
                <CardDescription>
                  Current balances and credit limits with partner hospitals
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hospital</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Credit Limit</TableHead>
                      <TableHead>Transactions</TableHead>
                      <TableHead>Trust Level</TableHead>
                      <TableHead>Last Activity</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partnerBalances.map((partner) => (
                      <TableRow key={partner.hospital}>
                        <TableCell className="font-medium">{partner.hospital}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {partner.balance > 0 ? (
                              <ArrowLeft className="h-4 w-4 text-green-600" />
                            ) : (
                              <ArrowRight className="h-4 w-4 text-red-600" />
                            )}
                            <span className={`font-medium ${getBalanceColor(partner.balance)}`}>
                              {Math.abs(partner.balance).toLocaleString()}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{partner.creditLimit.toLocaleString()}</TableCell>
                        <TableCell>{partner.transactions}</TableCell>
                        <TableCell>
                          <Badge className={getTrustColor(partner.trustLevel)}>
                            {partner.trustLevel.replace('-', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(partner.lastActivity).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setSelectedHospital(partner);
                              setShowSettlementDialog(true);
                            }}
                          >
                            Settle
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settlement Management */}
          <TabsContent value="settlements" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Settlement Options</CardTitle>
                <CardDescription>
                  Configure automatic settlement rules and preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {settlementOptions.map((option) => (
                  <div key={option.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <p className="font-medium">{option.name}</p>
                        {option.enabled && (
                          <Badge className="bg-green-100 text-green-800">Active</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                      {option.threshold && (
                        <p className="text-xs text-muted-foreground">
                          Threshold: {option.threshold.toLocaleString()} credits
                        </p>
                      )}
                    </div>
                    <Button variant={option.enabled ? "default" : "outline"}>
                      {option.enabled ? "Disable" : "Enable"}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Settlement History */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Settlements</CardTitle>
                <CardDescription>
                  History of completed settlement transactions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium">Monthly Settlement - November 2024</p>
                        <p className="text-sm text-muted-foreground">
                          Settled balances with 5 partner hospitals
                        </p>
                        <p className="text-xs text-muted-foreground">
                          2024-11-30 • Total Amount: 2,340 credits
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-green-100 text-green-800">Completed</Badge>
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <RotateCcw className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">Manual Settlement - Apollo Hospital</p>
                        <p className="text-sm text-muted-foreground">
                          Emergency settlement for high-value transaction
                        </p>
                        <p className="text-xs text-muted-foreground">
                          2024-11-28 • Amount: 850 credits
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-green-100 text-green-800">Completed</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Settlement Dialog */}
        <Dialog open={showSettlementDialog} onOpenChange={setShowSettlementDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Settlement Confirmation</DialogTitle>
              <DialogDescription>
                {selectedHospital 
                  ? `Settle balance with ${selectedHospital.hospital}`
                  : 'Settle balances with all partners'
                }
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {selectedHospital ? (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Current Balance:</span>
                      <span className={`font-bold ${getBalanceColor(selectedHospital.balance)}`}>
                        {selectedHospital.balance > 0 ? '+' : ''}{selectedHospital.balance.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Credit Limit:</span>
                      <span>{selectedHospital.creditLimit.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Total Transactions:</span>
                      <span>{selectedHospital.transactions}</span>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="amount">Settlement Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="Enter amount to settle"
                    value={settlementAmount}
                    onChange={(e) => setSettlementAmount(e.target.value)}
                  />
                </div>
              )}

              <div className="flex items-center space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <div className="text-sm text-yellow-700">
                  <p className="font-medium">Settlement Notice</p>
                  <p>This action will create a settlement transaction and update balances.</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowSettlementDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => {
                // Handle settlement logic here
                setShowSettlementDialog(false);
                setSelectedHospital(null);
                setSettlementAmount('');
              }}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Confirm Settlement
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}