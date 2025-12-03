# Guia de Desenvolvimento

Este documento fornece informações para desenvolvedores que desejam contribuir ou trabalhar no projeto.

## Setup do Ambiente

### Pré-requisitos

- Node.js 22+
- pnpm 8+
- MySQL 8+ (local ou remoto)
- Redis (local ou remoto)
- Git

### Instalação

```bash
# Clonar repositório
git clone <repositorio> mvcashnode
cd mvcashnode

# Instalar dependências
pnpm install

# Configurar .env
cp .env.example .env
# Editar .env com suas configurações

# Executar migrations
pnpm db:migrate

# Gerar Prisma Client
pnpm db:generate
```

## Estrutura de Código

### Monorepo

O projeto usa um monorepo gerenciado com `pnpm workspace`:

```
mvcashnode/
├── apps/
│   ├── api/              # API HTTP REST
│   ├── executor/         # Worker de execução
│   ├── monitors/         # Jobs agendados
│   └── frontend/         # Frontend (opcional)
├── packages/
│   ├── db/               # Prisma Client
│   ├── domain/           # Regras de negócio
│   ├── exchange/         # Adapters CCXT
│   ├── notifications/    # Cliente WhatsApp
│   └── shared/           # Utilitários
└── docs/                 # Documentação
```

### Convenções de Código

#### TypeScript

- Use TypeScript para todo código novo
- Evite `any`, use tipos específicos
- Use interfaces para objetos complexos
- Prefira `const` sobre `let`

#### Nomenclatura

- **Arquivos**: `kebab-case` (ex: `auth.controller.ts`)
- **Classes**: `PascalCase` (ex: `AuthController`)
- **Funções/Variáveis**: `camelCase` (ex: `getUserById`)
- **Constantes**: `UPPER_SNAKE_CASE` (ex: `MAX_RETRIES`)

#### Estrutura de Arquivos

```
module/
├── module.controller.ts    # Controller (endpoints)
├── module.service.ts       # Service (lógica de negócio)
├── module.module.ts        # Module (configuração NestJS)
├── dto/                    # Data Transfer Objects
│   ├── create-module.dto.ts
│   └── update-module.dto.ts
└── __tests__/              # Testes
    └── module.service.spec.ts
```

## Desenvolvimento

### Executar em Modo Desenvolvimento

```bash
# Todos os serviços
pnpm dev

# Apenas API
pnpm dev:api

# Apenas Executor
pnpm dev:executor

# Apenas Monitors
pnpm dev:monitors
```

### Hot Reload

- **API**: Hot reload automático com `nest start --watch`
- **Executor/Monitors**: Requer reinício manual

### Debugging

#### VS Code

Crie `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug API",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["dev:api"],
      "skipFiles": ["<node_internals>/**"],
      "cwd": "${workspaceFolder}"
    }
  ]
}
```

#### Logs

Os logs são salvos em `/logs`:
- `application-YYYY-MM-DD.log` - Logs gerais
- `error-YYYY-MM-DD.log` - Apenas erros

## Testes

### Executar Testes

```bash
# Todos os testes
pnpm test

# Testes unitários
pnpm test:unit

# Testes E2E
pnpm test:e2e

# Com cobertura
pnpm test --coverage
```

### Escrever Testes

Exemplo de teste unitário:

```typescript
describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AuthService, ...],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should login user', async () => {
    const result = await service.login({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result).toHaveProperty('accessToken');
  });
});
```

## Banco de Dados

### Migrations

```bash
# Criar nova migration
cd packages/db
pnpm prisma migrate dev --name nome_da_migration

# Aplicar migrations (produção)
pnpm db:migrate:deploy

# Reverter migration (desenvolvimento)
pnpm prisma migrate reset
```

### Prisma Studio

```bash
# Abrir Prisma Studio
pnpm db:studio
# Abre em http://localhost:5555
```

### Schema

O schema está em `packages/db/prisma/schema.prisma`. Após alterações:

```bash
# Gerar Prisma Client
pnpm db:generate
```

## Padrões de Código

### Controllers

```typescript
@ApiTags('Module')
@Controller('module')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ModuleController {
  constructor(private moduleService: ModuleService) {}

  @Get()
  @ApiOperation({ summary: 'Listar recursos' })
  @ApiResponse({ status: 200, description: 'Lista retornada' })
  async list(@CurrentUser() user: any) {
    return this.moduleService.list(user.userId);
  }
}
```

### Services

```typescript
@Injectable()
export class ModuleService {
  constructor(
    private prisma: PrismaService,
    private domainService: DomainService
  ) {}

  async list(userId: number) {
    return this.domainService.getItemsByUser(userId);
  }
}
```

### DTOs

```typescript
export class CreateModuleDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Nome do recurso' })
  name: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  description?: string;
}
```

## Git Workflow

### Branches

- `main` - Código de produção
- `develop` - Desenvolvimento
- `feature/nome` - Novas funcionalidades
- `fix/nome` - Correções de bugs

### Commits

Use mensagens descritivas:

```
feat: adiciona endpoint de listagem de posições
fix: corrige cálculo de PnL não realizado
docs: atualiza documentação da API
refactor: reorganiza estrutura de services
```

### Pull Requests

1. Criar branch a partir de `develop`
2. Fazer alterações
3. Escrever testes
4. Atualizar documentação se necessário
5. Criar PR com descrição clara

## Linting e Formatação

### ESLint

```bash
# Verificar código
pnpm lint

# Corrigir automaticamente
pnpm lint:fix
```

### Prettier

```bash
# Formatar código
pnpm format
```

## Documentação

### Swagger

Documente todos os endpoints com decorators do Swagger:

```typescript
@ApiOperation({ 
  summary: 'Resumo',
  description: 'Descrição detalhada'
})
@ApiResponse({ 
  status: 200, 
  description: 'Sucesso',
  schema: { example: { ... } }
})
```

### Comentários

Use JSDoc para funções complexas:

```typescript
/**
 * Calcula o PnL não realizado de uma posição
 * @param position - Posição a calcular
 * @param currentPrice - Preço atual do ativo
 * @returns PnL não realizado em USD
 */
function calculateUnrealizedPnL(position: Position, currentPrice: number): number {
  // ...
}
```

## Troubleshooting

### Erro de Build

```bash
# Limpar builds anteriores
pnpm clean

# Reinstalar dependências
rm -rf node_modules
pnpm install

# Rebuild
pnpm build
```

### Erro de Prisma

```bash
# Regenerar Prisma Client
pnpm db:generate

# Verificar migrations
pnpm db:migrate status
```

### Porta em Uso

```bash
# Verificar processo na porta
lsof -i :4010

# Matar processo
kill -9 <PID>
```

## Recursos Úteis

- **NestJS Docs**: https://docs.nestjs.com
- **Prisma Docs**: https://www.prisma.io/docs
- **TypeScript Docs**: https://www.typescriptlang.org/docs
- **Swagger/OpenAPI**: https://swagger.io/docs

---

**Última atualização**: 2025-02-12

