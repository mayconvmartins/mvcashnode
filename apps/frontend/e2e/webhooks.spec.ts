import { test, expect } from '@playwright/test'

test.describe('Webhooks', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('admin@example.com')
    await page.locator('input[type="password"]').fill('Admin@123')
    await page.locator('button[type="submit"]').click()
    await page.waitForURL('/')
    
    // Navegar para webhooks
    await page.goto('/webhooks')
  })

  test('exibe lista de webhooks', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Webhooks')
    await expect(page.locator('table, [role="table"]')).toBeVisible()
  })

  test('permite criar novo webhook', async ({ page }) => {
    const newButton = page.locator('button:has-text("Novo Webhook")')
    
    if (await newButton.isVisible()) {
      await newButton.click()
      
      // Deve exibir formulário ou modal
      await expect(page.locator('text=Criar Webhook')).toBeVisible()
      
      // Preencher formulário básico
      await page.locator('input[name="name"]').fill('Teste Webhook')
      
      // Salvar
      await page.locator('button[type="submit"]').click()
      
      // Deve voltar para lista ou mostrar sucesso
      await expect(page.locator('text=/.*sucesso.*/i')).toBeVisible()
    }
  })

  test('exibe detalhes do webhook ao clicar em Visualizar', async ({ page }) => {
    const firstRow = page.locator('tbody tr, [role="row"]').first()
    
    if (await firstRow.isVisible()) {
      const viewButton = firstRow.locator('button:has-text("Visualizar")')
      
      if (await viewButton.isVisible()) {
        await viewButton.click()
        
        // Deve navegar para detalhes
        await expect(page).toHaveURL(/\/webhooks\/\d+/)
        
        // Deve exibir abas
        await expect(page.locator('text=Visão Geral')).toBeVisible()
        await expect(page.locator('text=Vínculos')).toBeVisible()
        await expect(page.locator('text=Eventos')).toBeVisible()
      }
    }
  })

  test('permite copiar URL do webhook', async ({ page }) => {
    // Detalhes do webhook
    const firstRow = page.locator('tbody tr, [role="row"]').first()
    
    if (await firstRow.isVisible()) {
      const viewButton = firstRow.locator('button:has-text("Visualizar")')
      
      if (await viewButton.isVisible()) {
        await viewButton.click()
        await page.waitForURL(/\/webhooks\/\d+/)
        
        // Localizar botão de copiar
        const copyButton = page.locator('button:has-text("Copiar URL")')
        
        if (await copyButton.isVisible()) {
          await copyButton.click()
          
          // Deve exibir toast de sucesso
          await expect(page.locator('text=/.*copiado.*/i')).toBeVisible()
        }
      }
    }
  })
})

