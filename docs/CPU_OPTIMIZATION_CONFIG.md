# Configurações de Otimização de CPU

## Connection Pool do Prisma

Para otimizar o uso de CPU e melhorar o desempenho do banco de dados, configure os seguintes parâmetros na `DATABASE_URL`:

### Configuração Recomendada

Adicione os seguintes parâmetros à sua `DATABASE_URL` no arquivo `.env`:

```env
DATABASE_URL="mysql://user:password@host:port/database?connection_limit=20&pool_timeout=20&connect_timeout=10"
```

### Parâmetros Explicados

- **`connection_limit=20`**: Aumenta o pool de conexões de 10 (padrão) para 20
  - Permite que mais queries sejam executadas em paralelo
  - Reduz tempo de espera por conexão disponível
  - Economiza CPU que seria gasto aguardando conexões

- **`pool_timeout=20`**: Define timeout de 20 segundos para aguardar conexão disponível
  - Previne travamentos quando pool está cheio
  - Valor em segundos

- **`connect_timeout=10`**: Define timeout de 10 segundos para estabelecer conexão inicial
  - Evita que conexões lentas bloqueiem o processo
  - Valor em segundos

### Exemplo Completo

```env
# Desenvolvimento Local
DATABASE_URL="mysql://root:password@localhost:3306/mvcashnode?connection_limit=15&pool_timeout=15&connect_timeout=10"

# Produção
DATABASE_URL="mysql://user:pass@production-host:3306/mvcashnode?connection_limit=20&pool_timeout=20&connect_timeout=10"
```

### Monitoramento

Após aplicar as configurações, monitore:

1. **Uso de CPU**: Deve reduzir em ~5-8%
2. **Latência de Queries**: Deve diminuir
3. **Conexões MySQL**: Verifique se não ultrapassa o limite do servidor

Use o comando para verificar conexões ativas:

```sql
SHOW PROCESSLIST;
SHOW STATUS LIKE 'Threads_connected';
```

### Ajuste Fino

Se você tem muitos workers ou alto volume de requisições:
- Aumente `connection_limit` até 30
- Monitore uso de memória do MySQL
- Não exceda `max_connections` do servidor MySQL (padrão: 151)

## Referências

- [Prisma Connection Management](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management)
- [MySQL Connection Pool Best Practices](https://dev.mysql.com/doc/refman/8.0/en/connection-interfaces.html)

