import { test, expect } from '@playwright/test'

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('exibe o formulário de login corretamente', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('valida campos obrigatórios', async ({ page }) => {
    const submitButton = page.locator('button[type="submit"]')
    await submitButton.click()
    
    // Deve haver mensagens de validação
    await expect(page.locator('text=Email é obrigatório')).toBeVisible()
    await expect(page.locator('text=Senha é obrigatória')).toBeVisible()
  })

  test('realiza login com credenciais válidas', async ({ page }) => {
    // Preencher formulário
    await page.locator('input[type="email"]').fill('admin@example.com')
    await page.locator('input[type="password"]').fill('Admin@123')
    
    // Submeter
    await page.locator('button[type="submit"]').click()
    
    // Deve redirecionar para dashboard
    await expect(page).toHaveURL('/')
    
    // Deve exibir elementos do dashboard
    await expect(page.locator('text=Dashboard')).toBeVisible()
  })

  test('exibe erro com credenciais inválidas', async ({ page }) => {
    await page.locator('input[type="email"]').fill('invalid@example.com')
    await page.locator('input[type="password"]').fill('wrongpassword')
    
    await page.locator('button[type="submit"]').click()
    
    // Deve exibir mensagem de erro
    await expect(page.locator('text=/.*Falha no login.*/i')).toBeVisible()
  })

  test('suporta 2FA quando necessário', async ({ page }) => {
    // Login inicial
    await page.locator('input[type="email"]').fill('user-with-2fa@example.com')
    await page.locator('input[type="password"]').fill('Password@123')
    await page.locator('button[type="submit"]').click()
    
    // Deve exibir campo de código 2FA
    await expect(page.locator('input[placeholder*="2FA"]')).toBeVisible()
    
    // Preencher código 2FA
    await page.locator('input[placeholder*="2FA"]').fill('123456')
    await page.locator('button[type="submit"]').click()
    
    // Deve redirecionar ou mostrar erro dependendo da validade do código
  })
})

