# API de Monitoramento - Documentação

O sistema de monitoramento é executado no backend e fornece endpoints REST para o frontend consumir informações sobre o estado do sistema.

## Arquitetura

### Backend
- **Serviço**: `MonitoringService` (`apps/api/src/monitoring/`)
- **Coleta de Métricas**: A cada 30 segundos via job BullMQ
- **Persistência**: Tabelas `system_monitoring_logs` e `system_alerts`
- **Tecnologias**: 
  - `systeminformation` - Métricas de CPU, memória, disco
  - `pidusage` - Uso de recursos por processo
  - BullMQ - Gerenciamento de jobs

### Frontend
- **Serviço**: `monitoringService` (`apps/frontend/src/lib/api/monitoring.service.ts`)
- **Componentes**: 
  - `SystemStatus` - Cards de status geral
  - `ProcessesList` - Lista de processos
  - `AlertsPanel` - Painel de alertas
- **Auto-refresh**: 10 segundos
- **Notificações**: Toast automático para novos alertas

## Endpoints API

### 1. GET /monitoring/status
Status geral do sistema

**Autenticação**: Bearer Token (Admin only)

**Response**:
```json
{
  "services": {
    "api": {
      "pid": 12345,
      "name": "API",
      "cpu": 25.5,
      "memory": 524288000,
      "uptime": 3600,
      "status": "running",
      "lastUpdate": "2025-12-02T12:00:00Z"
    }
  },
  "resources": {
    "database": {
      "status": "healthy",
      "responseTime": 10
    },
    "redis": {
      "status": "healthy",
      "responseTime": 5
    }
  },
  "system": {
    "cpu": {
      "usage": 45.2,
      "cores": 8,
      "speed": 2.4
    },
    "memory": {
      "total": 17179869184,
      "used": 8589934592,
      "free": 8589934592,
      "usagePercent": 50.0
    },
    "disk": {
      "total": 1000000000000,
      "used": 500000000000,
      "free": 500000000000,
      "usagePercent": 50.0
    },
    "uptime": 86400,
    "timestamp": "2025-12-02T12:00:00Z"
  },
  "alerts": {
    "critical": 2,
    "high": 5,
    "medium": 3,
    "low": 1
  }
}
```

### 2. GET /monitoring/processes
Lista todos os processos monitorados

**Autenticação**: Bearer Token (Admin only)

**Response**:
```json
[
  {
    "pid": 12345,
    "name": "API",
    "cpu": 25.5,
    "memory": 524288000,
    "uptime": 3600,
    "status": "running",
    "lastUpdate": "2025-12-02T12:00:00Z"
  }
]
```

### 3. GET /monitoring/jobs
Lista métricas de jobs BullMQ

**Autenticação**: Bearer Token (Admin only)

**Response**:
```json
[
  {
    "name": "sl-tp-monitor-real",
    "description": "Monitor de SL/TP para modo REAL",
    "status": "active",
    "lastExecution": {
      "timestamp": "2025-12-02T12:00:00Z",
      "duration": 1250,
      "result": "success"
    },
    "nextExecution": "2025-12-02T12:01:00Z",
    "statistics": {
      "totalRuns": 1000,
      "successCount": 950,
      "failureCount": 50,
      "avgDuration": 1250
    }
  }
]
```

### 4. GET /monitoring/alerts
Lista alertas ativos (não resolvidos)

**Autenticação**: Bearer Token (Admin only)

**Response**:
```json
[
  {
    "id": 1,
    "alert_type": "HIGH_CPU",
    "severity": "high",
    "message": "CPU usage above 90%",
    "service_name": "API",
    "metadata_json": {
      "cpu": 95.5
    },
    "created_at": "2025-12-02T12:00:00Z",
    "resolved_at": null,
    "resolved_by": null
  }
]
```

### 5. POST /monitoring/alerts/:id/resolve
Resolve um alerta

**Autenticação**: Bearer Token (Admin only)

**Parâmetros**:
- `id` (path): ID do alerta

**Response**:
```json
{
  "id": 1,
  "alert_type": "HIGH_CPU",
  "severity": "high",
  "message": "CPU usage above 90%",
  "service_name": "API",
  "created_at": "2025-12-02T12:00:00Z",
  "resolved_at": "2025-12-02T12:05:00Z",
  "resolved_by": 1
}
```

### 6. GET /monitoring/history
Histórico de logs de monitoramento

**Autenticação**: Bearer Token (Admin only)

**Query Parameters**:
- `service` (opcional): Filtrar por serviço (API, EXECUTOR, MONITORS)
- `limit` (opcional): Limitar resultados (padrão: 100)

**Response**:
```json
[
  {
    "id": 1,
    "timestamp": "2025-12-02T12:00:00Z",
    "service_name": "API",
    "process_id": 12345,
    "status": "running",
    "cpu_usage": 25.5,
    "memory_usage": 524288000,
    "metrics_json": {
      "uptime": 3600
    }
  }
]
```

### 7. GET /monitoring/metrics
Métricas agregadas para gráficos

**Autenticação**: Bearer Token (Admin only)

**Query Parameters**:
- `hours` (opcional): Horas para buscar (padrão: 24)

**Response**:
```json
{
  "API": [
    {
      "timestamp": "2025-12-02T11:00:00Z",
      "cpu": 25.5,
      "memory": 524288000
    },
    {
      "timestamp": "2025-12-02T12:00:00Z",
      "cpu": 30.2,
      "memory": 550000000
    }
  ],
  "EXECUTOR": [
    {
      "timestamp": "2025-12-02T11:00:00Z",
      "cpu": 15.3,
      "memory": 300000000
    }
  ]
}
```

## Tipos de Alertas

### Alertas Automáticos
O sistema gera alertas automaticamente quando detecta:

1. **HIGH_CPU**: CPU do processo acima de 90%
2. **HIGH_MEMORY**: Memória do processo acima de 1GB
3. **HIGH_SYSTEM_MEMORY**: Memória do sistema acima de 85%
4. **HIGH_DISK_USAGE**: Disco acima de 90%
5. **PROCESS_STUCK**: Processo sem atualizações há mais de 5 minutos
6. **SERVICE_DOWN**: Serviço não responde

### Severidades
- **critical**: Requer ação imediata
- **high**: Requer atenção prioritária
- **medium**: Requer investigação
- **low**: Informativo

## Job de Monitoramento

### Configuração
- **Nome**: `system-monitor`
- **Intervalo**: 30 segundos
- **Processor**: `SystemMonitorProcessor`

### Responsabilidades
1. Coletar métricas do processo atual
2. Salvar logs no banco de dados
3. Coletar métricas do sistema (CPU, memória, disco)
4. Verificar thresholds e gerar alertas
5. Detectar processos travados

## Acesso via Swagger

A documentação interativa está disponível em:
- **URL**: `http://localhost:4010/api-docs`
- **Tag**: Monitoring
- **Autenticação**: Necessário Bearer Token de usuário admin

## Páginas Frontend

### /monitoring
Dashboard completo de monitoramento com:
- Cards de status dos serviços
- Métricas de sistema (CPU, memória)
- Lista de processos
- Painel de alertas
- Auto-refresh a cada 10 segundos

**Acesso**: Apenas usuários com role `admin`

