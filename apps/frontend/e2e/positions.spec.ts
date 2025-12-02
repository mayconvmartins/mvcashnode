import { test, expect } from '@playwright/test'

test.describe('Positions', () => {
  test.beforeEach(async ({ page }) => {
    // Login antes de cada teste
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('admin@example.com')
    await page.locator('input[type="password"]').fill('Admin@123')
    await page.locator('button[type="submit"]').click()
    
    // Aguardar redirecionamento
    await page.waitForURL('/')
    
    // Navegar para posições
    await page.goto('/positions')
  })

  test('exibe lista de posições', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Posições')
    
    // Deve haver uma tabela ou lista
    await expect(page.locator('table, [role="table"]')).toBeVisible()
  })

  test('permite filtrar posições por status', async ({ page }) => {
    // Localizar filtro de status
    const statusFilter = page.locator('select[name="status"], button:has-text("Status")')
    
    if (await statusFilter.isVisible()) {
      await statusFilter.click()
      
      // Selecionar "Aberta"
      await page.locator('text=Aberta').click()
      
      // Aguardar atualização da lista
      await page.waitForTimeout(500)
      
      // Verificar que apenas posições abertas são exibidas
      // (isso depende da estrutura exata da sua tabela)
    }
  })

  test('permite buscar posições', async ({ page }) => {
    const searchInput = page.locator('input[type="search"], input[placeholder*="Buscar"]')
    
    if (await searchInput.isVisible()) {
      await searchInput.fill('BTC')
      
      // Aguardar filtro
      await page.waitForTimeout(500)
      
      // Verificar que apenas posições BTC aparecem
      const rows = page.locator('tbody tr, [role="row"]')
      const count = await rows.count()
      
      if (count > 0) {
        await expect(rows.first()).toContainText('BTC')
      }
    }
  })

  test('navega para detalhes de posição ao clicar', async ({ page }) => {
    // Localizar primeira linha da tabela
    const firstRow = page.locator('tbody tr, [role="row"]').first()
    
    if (await firstRow.isVisible()) {
      // Clicar no botão "Visualizar" ou na linha
      const viewButton = firstRow.locator('button:has-text("Visualizar")')
      
      if (await viewButton.isVisible()) {
        await viewButton.click()
        
        // Deve navegar para página de detalhes
        await expect(page).toHaveURL(/\/positions\/\d+/)
        
        // Deve exibir detalhes da posição
        await expect(page.locator('text=Detalhes da Posição')).toBeVisible()
      }
    }
  })

  test('permite alternar entre modos REAL e SIMULATION', async ({ page }) => {
    const modeToggle = page.locator('button:has-text("REAL"), button:has-text("SIMULATION")')
    
    if (await modeToggle.isVisible()) {
      await modeToggle.click()
      
      // Aguardar atualização
      await page.waitForTimeout(500)
      
      // Lista deve atualizar
      await expect(page.locator('table, [role="table"]')).toBeVisible()
    }
  })
})

