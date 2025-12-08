'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfigTab } from './components/ConfigTab';
import { PaymentsTab } from './components/PaymentsTab';
import { WebhookLogsTab } from './components/WebhookLogsTab';

export default function MercadoPagoConfigPage() {
  const [activeTab, setActiveTab] = useState('config');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mercado Pago</h1>
        <p className="text-muted-foreground">
          Gerencie configurações, pagamentos e logs de webhook do Mercado Pago
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="config">Configuração</TabsTrigger>
          <TabsTrigger value="payments">Pagamentos</TabsTrigger>
          <TabsTrigger value="logs">Logs de Webhook</TabsTrigger>
        </TabsList>
        
        <TabsContent value="config" className="mt-6">
          <ConfigTab />
        </TabsContent>
        
        <TabsContent value="payments" className="mt-6">
          <PaymentsTab />
        </TabsContent>
        
        <TabsContent value="logs" className="mt-6">
          <WebhookLogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
