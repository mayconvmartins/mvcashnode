# Documentação do Trading Automation Backend

Bem-vindo à documentação completa do sistema de automação de trading. Este diretório contém toda a documentação técnica e guias de uso do projeto.

## 📚 Índice da Documentação

### Documentação Principal

- **[SETUP.md](./SETUP.md)** - Guia completo de instalação e configuração do projeto
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Arquitetura do sistema e estrutura do monorepo
- **[API.md](./API.md)** - Documentação completa da API REST
- **[DATABASE.md](./DATABASE.md)** - Modelo de dados e schema do banco
- **[TRADING.md](./TRADING.md)** - Conceitos de trading e funcionamento do sistema
- **[WEBHOOK_MONITOR.md](./WEBHOOK_MONITOR.md)** - Módulo Monitor Webhook

### Guias de Desenvolvimento e Deploy

- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Guia para desenvolvedores
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Guia de deploy e produção

### Documentação Técnica Adicional

- **[MONITORING_API.md](./MONITORING_API.md)** - API de monitoramento do sistema
- **[SUBSCRIPTIONS.md](./SUBSCRIPTIONS.md)** - Módulo de assinaturas e pagamentos
- **[TRANSFI.md](./TRANSFI.md)** - Integração TransFi Gateway de Pagamento
- **[RESIDUE_HANDLING.md](./RESIDUE_HANDLING.md)** - Sistema de gerenciamento de resíduos
- **[SECURITY_VALIDATIONS.md](./SECURITY_VALIDATIONS.md)** - Validações de segurança financeira
- **[CHANGELOG.md](./CHANGELOG.md)** - Histórico de mudanças e versões

## 🚀 Início Rápido

1. **Primeira vez?** Comece pelo [SETUP.md](./SETUP.md) para configurar o ambiente
2. **Quer entender a arquitetura?** Leia o [ARCHITECTURE.md](./ARCHITECTURE.md)
3. **Precisa usar a API?** Consulte o [API.md](./API.md) ou acesse `/api-docs` quando a API estiver rodando
4. **Desenvolver?** Veja o [DEVELOPMENT.md](./DEVELOPMENT.md)

## 🔗 Links Úteis

- **Swagger UI**: http://localhost:4010/api-docs (quando a API estiver rodando)
- **Prisma Studio**: Execute `pnpm db:studio` para visualizar o banco de dados
- **README Principal**: [../README.md](../README.md)

## 📖 Estrutura do Projeto

```
mvcashnode/
├── apps/
│   ├── api/          # API HTTP REST (NestJS)
│   ├── executor/     # Worker de execução de ordens
│   ├── monitors/      # Jobs agendados (SL/TP, sync, etc)
│   └── frontend/      # Frontend Next.js
├── packages/
│   ├── db/           # Prisma Client e migrations
│   ├── domain/       # Regras de negócio
│   ├── exchange/     # Adapters CCXT
│   ├── notifications/# Cliente WhatsApp
│   └── shared/       # Utilitários compartilhados
└── docs/             # Esta documentação
```

## 🎯 Principais Funcionalidades

- **Autenticação**: JWT + 2FA (TOTP)
- **Contas de Exchange**: Suporte a múltiplas exchanges (Binance, Bybit, etc.)
- **Cofres Virtuais**: Gerenciamento de capital
- **Posições**: Rastreamento de posições abertas e fechadas
- **Webhooks**: Recebimento de sinais de trading
- **Monitor Webhook**: Rastreamento de preços antes de executar compras
- **Stop Loss / Take Profit**: Monitoramento automático
- **Notificações**: WhatsApp via Evolution API
- **Relatórios**: PnL, performance e métricas
- **Assinaturas**: Sistema de planos e pagamentos (TransFi)

## 📝 Convenções

- Todos os arquivos de documentação estão em Markdown
- Exemplos de código usam TypeScript/JavaScript
- Comandos assumem uso de `pnpm` como gerenciador de pacotes
- Variáveis de ambiente são referenciadas como `VAR_NAME`

## 🤝 Contribuindo

Para contribuir com a documentação:

1. Edite os arquivos Markdown em `docs/`
2. Mantenha a formatação consistente
3. Adicione exemplos práticos quando possível
4. Atualize este índice se criar novos arquivos

## 📞 Suporte

Para dúvidas ou problemas:

1. Consulte a documentação relevante acima
2. Verifique o [SETUP.md](./SETUP.md) para problemas de instalação
3. Veja os logs em `/logs` para erros do sistema

---

**Última atualização**: 2025-12-18

