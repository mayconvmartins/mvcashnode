# 🧪 Guia de Testes - Frontend MVCash

Este documento descreve como executar e criar testes para o frontend do MVCash.

## 📋 Índice

- [Testes Unitários](#testes-unitários)
- [Testes E2E](#testes-e2e)
- [Executando Testes](#executando-testes)
- [Cobertura de Código](#cobertura-de-código)
- [Boas Práticas](#boas-práticas)

---

## 🔬 Testes Unitários

### Stack

- **Jest**: Framework de testes
- **Testing Library**: Utilitários para testar componentes React
- **jest-dom**: Matchers customizados para DOM

### Estrutura

```
apps/frontend/
├── __tests__/
│   ├── components/     # Testes de componentes
│   ├── hooks/          # Testes de hooks
│   └── utils/          # Testes de utilitários
├── jest.config.js
└── jest.setup.js
```

### Executando Testes Unitários

```bash
# Modo watch (desenvolvimento)
pnpm test

# Executar uma vez (CI)
pnpm test:ci

# Com cobertura
pnpm test:ci
```

### Exemplo de Teste Unitário

```typescript
// __tests__/components/Button.test.tsx
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'

describe('Button', () => {
  it('renderiza corretamente', () => {
    render(<Button>Clique aqui</Button>)
    expect(screen.getByText('Clique aqui')).toBeInTheDocument()
  })

  it('dispara evento de clique', async () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick}>Clique</Button>)
    
    await userEvent.click(screen.getByText('Clique'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
```

---

## 🎭 Testes E2E

### Stack

- **Playwright**: Framework de testes E2E
- **Suporte a múltiplos navegadores**: Chrome, Firefox, Safari
- **Suporte mobile**: Testes em devices móveis

### Estrutura

```
apps/frontend/
├── e2e/
│   ├── login.spec.ts
│   ├── positions.spec.ts
│   └── webhooks.spec.ts
└── playwright.config.ts
```

### Executando Testes E2E

```bash
# Instalar navegadores (primeira vez)
pnpm playwright:install

# Executar testes
pnpm test:e2e

# Modo UI (interativo)
pnpm test:e2e:ui

# Com navegador visível
pnpm test:e2e:headed

# Executar apenas um arquivo
pnpm test:e2e login.spec.ts

# Executar apenas um navegador
pnpm test:e2e --project=chromium
```

### Exemplo de Teste E2E

```typescript
// e2e/login.spec.ts
import { test, expect } from '@playwright/test'

test('login com credenciais válidas', async ({ page }) => {
  await page.goto('/login')
  
  await page.locator('input[type="email"]').fill('admin@example.com')
  await page.locator('input[type="password"]').fill('Admin@123')
  await page.locator('button[type="submit"]').click()
  
  await expect(page).toHaveURL('/')
  await expect(page.locator('text=Dashboard')).toBeVisible()
})
```

---

## 🏃 Executando Testes

### Testes Unitários

```bash
# Desenvolvimento (watch mode)
pnpm test

# Executar todos os testes uma vez
pnpm test:ci

# Com cobertura de código
pnpm test:ci
```

### Testes E2E

```bash
# Setup inicial (instalar navegadores)
pnpm playwright:install

# Executar testes E2E
pnpm test:e2e

# Modo interativo (UI)
pnpm test:e2e:ui

# Debugando testes
pnpm test:e2e --debug

# Executar em um navegador específico
pnpm test:e2e --project=chromium
pnpm test:e2e --project=firefox
pnpm test:e2e --project=webkit
```

### CI/CD

```bash
# Pipeline completo
pnpm test:ci && pnpm test:e2e
```

---

## 📊 Cobertura de Código

### Gerando Relatório de Cobertura

```bash
pnpm test:ci
```

O relatório será gerado em `coverage/`:
- `coverage/lcov-report/index.html` - Relatório HTML interativo
- `coverage/lcov.info` - Formato LCOV para ferramentas de CI

### Metas de Cobertura

- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 80%
- **Lines**: > 80%

---

## ✅ Boas Práticas

### Testes Unitários

1. **AAA Pattern**: Arrange, Act, Assert
   ```typescript
   test('calcula soma corretamente', () => {
     // Arrange
     const a = 5
     const b = 3
     
     // Act
     const result = sum(a, b)
     
     // Assert
     expect(result).toBe(8)
   })
   ```

2. **Testar comportamento, não implementação**
   ```typescript
   // ❌ Ruim
   expect(component.state.value).toBe(10)
   
   // ✅ Bom
   expect(screen.getByText('10')).toBeInTheDocument()
   ```

3. **Usar Testing Library queries apropriadas**
   ```typescript
   // Ordem de preferência:
   getByRole       // Melhor
   getByLabelText
   getByPlaceholderText
   getByText
   getByDisplayValue
   getByAltText
   getByTitle
   getByTestId     // Último recurso
   ```

4. **Limpar após cada teste**
   ```typescript
   afterEach(() => {
     jest.clearAllMocks()
   })
   ```

### Testes E2E

1. **Usar seletores estáveis**
   ```typescript
   // ❌ Ruim (frágil)
   page.locator('.btn-primary')
   
   // ✅ Bom (estável)
   page.locator('button[type="submit"]')
   page.getByRole('button', { name: 'Login' })
   ```

2. **Aguardar elementos corretamente**
   ```typescript
   // ❌ Ruim
   await page.waitForTimeout(1000)
   
   // ✅ Bom
   await page.waitForSelector('text=Dashboard')
   await expect(page.locator('text=Dashboard')).toBeVisible()
   ```

3. **Isolar testes**
   ```typescript
   test.beforeEach(async ({ page }) => {
     // Setup limpo para cada teste
     await page.goto('/login')
     // Login se necessário
   })
   ```

4. **Usar fixtures para dados**
   ```typescript
   const testUser = {
     email: 'test@example.com',
     password: 'Test@123'
   }
   ```

---

## 🐛 Debugging

### Testes Unitários

```bash
# Executar em modo debug
node --inspect-brk node_modules/.bin/jest --runInBand

# Ver output console
DEBUG_PRINT_LIMIT=0 pnpm test
```

### Testes E2E

```bash
# Modo debug interativo
pnpm test:e2e --debug

# Ver navegador
pnpm test:e2e:headed

# Pausar em falhas
pnpm test:e2e --headed --pause-on-failure

# Gerar trace
pnpm test:e2e --trace on
```

---

## 📝 Adicionando Novos Testes

### Teste Unitário

1. Criar arquivo em `__tests__/[categoria]/[nome].test.tsx`
2. Importar dependências:
   ```typescript
   import { render, screen } from '@testing-library/react'
   import { MyComponent } from '@/components/MyComponent'
   ```
3. Escrever testes:
   ```typescript
   describe('MyComponent', () => {
     it('renderiza corretamente', () => {
       render(<MyComponent />)
       expect(screen.getByText('Texto esperado')).toBeInTheDocument()
     })
   })
   ```

### Teste E2E

1. Criar arquivo em `e2e/[nome].spec.ts`
2. Importar Playwright:
   ```typescript
   import { test, expect } from '@playwright/test'
   ```
3. Escrever testes:
   ```typescript
   test.describe('Feature', () => {
     test('funciona corretamente', async ({ page }) => {
       await page.goto('/feature')
       // Interações e asserções
     })
   })
   ```

---

## 🔗 Recursos

- [Jest Documentation](https://jestjs.io/)
- [Testing Library](https://testing-library.com/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

---

## 📞 Suporte

Se encontrar problemas com os testes:

1. Verificar se todas as dependências estão instaladas: `pnpm install`
2. Para E2E, instalar navegadores: `pnpm playwright:install`
3. Limpar cache: `pnpm jest --clearCache`
4. Consultar logs detalhados com `--verbose`

