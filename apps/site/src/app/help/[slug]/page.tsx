'use client';

import Link from 'next/link';
import { use } from 'react';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const manuals: Record<string, { title: string; content: string }> = {
  'login': {
    title: 'Como fazer login',
    content: `
      <h2>Como fazer login na plataforma MvCash</h2>
      <p>Para acessar sua conta na plataforma MvCash, siga estes passos:</p>
      <ol>
        <li>Acesse <a href="https://app.mvcash.com.br" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">app.mvcash.com.br</a></li>
        <li>Na página de login, informe seu e-mail e senha</li>
        <li>Clique no botão "Entrar"</li>
        <li>Se você ativou o 2FA, será solicitado o código de autenticação</li>
      </ol>
      <p><strong>Esqueceu sua senha?</strong></p>
      <p>Clique em "Esqueci minha senha" na página de login e siga as instruções para redefinir.</p>
    `,
  },
  'ativar-2fa': {
    title: 'Como ativar o 2FA',
    content: `
      <h2>Como ativar o 2FA (Autenticação de Dois Fatores)</h2>
      <p>O 2FA adiciona uma camada extra de segurança à sua conta. Para ativar:</p>
      <ol>
        <li>Faça login na plataforma</li>
        <li>Vá até o menu "Perfil" ou "Configurações"</li>
        <li>Procure pela opção "Segurança" ou "Autenticação de Dois Fatores"</li>
        <li>Clique em "Ativar 2FA"</li>
        <li>Escaneie o QR Code com um aplicativo autenticador (Google Authenticator, Authy, etc.)</li>
        <li>Digite o código de 6 dígitos gerado pelo aplicativo para confirmar</li>
        <li>Guarde os códigos de recuperação em local seguro</li>
      </ol>
      <p><strong>Importante:</strong> Sem os códigos de recuperação, você pode perder acesso à conta se perder o dispositivo com o autenticador.</p>
    `,
  },
  'criar-parametros': {
    title: 'Como criar parâmetros',
    content: `
      <h2>Como criar parâmetros de trading</h2>
      <p>Os parâmetros definem como suas operações serão executadas. Para criar:</p>
      <ol>
        <li>Acesse o menu "Parâmetros" na plataforma</li>
        <li>Clique em "Novo Parâmetro"</li>
        <li>Preencha as informações básicas:
          <ul>
            <li><strong>Nome:</strong> Dê um nome descritivo ao parâmetro</li>
            <li><strong>Conta:</strong> Selecione a conta da Binance que será usada</li>
            <li><strong>Símbolo:</strong> Escolha o par de moedas (ex: BTCUSDT)</li>
          </ul>
        </li>
        <li>Configure os limites:
          <ul>
            <li>Valor mínimo e máximo por operação</li>
            <li>Quantidade de posições simultâneas</li>
          </ul>
        </li>
        <li>Defina o tamanho da ordem (percentual do capital ou valor fixo)</li>
        <li>Configure SL/TP (Stop Loss e Take Profit) se desejar</li>
        <li>Salve o parâmetro</li>
      </ol>
      <p><strong>Dica:</strong> Você pode criar múltiplos parâmetros para diferentes estratégias ou símbolos.</p>
    `,
  },
  'criar-api-binance': {
    title: 'Como criar API na Binance',
    content: `
      <h2>Como criar API na Binance</h2>
      <p>Para conectar sua conta da Binance à plataforma MvCash, você precisa criar uma API Key:</p>
      <ol>
        <li>Acesse <a href="https://www.binance.com" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">www.binance.com</a> e faça login</li>
        <li>Vá até o menu do perfil (ícone no canto superior direito)</li>
        <li>Selecione "API Management" ou "Gerenciamento de API"</li>
        <li>Clique em "Create API" ou "Criar API"</li>
        <li>Escolha "System generated" (gerado pelo sistema)</li>
        <li>Complete a verificação de segurança (e-mail, SMS, etc.)</li>
        <li>Configure as permissões da API:
          <ul>
            <li><strong>Enable Reading:</strong> Deve estar ativado (necessário para consultas)</li>
            <li><strong>Enable Spot & Margin Trading:</strong> Ative se for operar no spot</li>
            <li><strong>Enable Futures:</strong> Ative se for operar futuros</li>
            <li><strong>Enable Withdrawals:</strong> <strong>NÃO ATIVE</strong> por segurança</li>
          </ul>
        </li>
        <li>Adicione um endereço IP de restrição (recomendado):
          <ul>
            <li>Adicione o IP do servidor MvCash (fornecido pelo suporte)</li>
            <li>Ou deixe em branco se não souber (menos seguro)</li>
          </ul>
        </li>
        <li>Confirme a criação da API</li>
        <li>Copie a <strong>API Key</strong> e o <strong>Secret Key</strong> (você só verá o Secret uma vez!)</li>
      </ol>
      <p><strong>Segurança:</strong></p>
      <ul>
        <li>Nunca compartilhe suas chaves de API</li>
        <li>Não ative permissão de saque (withdrawals)</li>
        <li>Use restrição de IP quando possível</li>
        <li>Revise regularmente as permissões das suas APIs</li>
      </ul>
    `,
  },
  'adicionar-conta': {
    title: 'Como adicionar conta na plataforma',
    content: `
      <h2>Como adicionar conta na plataforma</h2>
      <p>Após criar sua API na Binance, adicione a conta na plataforma MvCash:</p>
      <ol>
        <li>Acesse o menu "Contas" na plataforma</li>
        <li>Clique em "Nova Conta" ou "Adicionar Conta"</li>
        <li>Preencha os dados:
          <ul>
            <li><strong>Nome:</strong> Dê um nome para identificar a conta (ex: "Conta Principal")</li>
            <li><strong>Exchange:</strong> Selecione "Binance"</li>
            <li><strong>API Key:</strong> Cole a API Key criada na Binance</li>
            <li><strong>Secret Key:</strong> Cole o Secret Key (mantenha em segurança!)</li>
            <li><strong>Ambiente:</strong> Escolha entre "Real" ou "Testnet" (para testes)</li>
          </ul>
        </li>
        <li>Clique em "Testar Conexão" para verificar se as credenciais estão corretas</li>
        <li>Se o teste for bem-sucedido, clique em "Salvar"</li>
        <li>A conta será criptografada e armazenada com segurança</li>
      </ol>
      <p><strong>Importante:</strong></p>
      <ul>
        <li>As credenciais são criptografadas antes de serem salvas</li>
        <li>Você pode adicionar múltiplas contas</li>
        <li>Cada conta pode ter diferentes permissões e configurações</li>
        <li>Use a função "Testar Conexão" sempre que adicionar ou modificar uma conta</li>
      </ul>
    `,
  },
  'monitor-sltp': {
    title: 'Como funciona o monitor SL/TP',
    content: `
      <h2>Como funciona o monitor SL/TP</h2>
      <p>O monitor SL/TP acompanha suas posições em tempo real e executa vendas automáticas quando os limites são atingidos.</p>
      <h3>Funcionalidades:</h3>
      <ul>
        <li><strong>Monitoramento em tempo real:</strong> Verifica o preço atual de todas as posições abertas</li>
        <li><strong>Execução automática:</strong> Vende automaticamente quando SL ou TP é atingido</li>
        <li><strong>Histórico de execuções:</strong> Registra todas as vendas automáticas realizadas</li>
        <li><strong>Alertas:</strong> Notifica quando uma posição é fechada automaticamente</li>
      </ul>
      <h3>Como acessar:</h3>
      <ol>
        <li>Vá até o menu "Monitoramento" na plataforma</li>
        <li>Selecione "Monitor SL/TP"</li>
        <li>Você verá uma lista de todas as posições sendo monitoradas</li>
      </ol>
      <h3>Informações exibidas:</h3>
      <ul>
        <li>Símbolo da posição</li>
        <li>Preço de entrada</li>
        <li>Preço atual</li>
        <li>Stop Loss configurado</li>
        <li>Take Profit configurado</li>
        <li>Status (monitorando, vendido, etc.)</li>
      </ul>
      <p><strong>Dica:</strong> O monitor funciona 24/7, mesmo quando você não está logado na plataforma.</p>
    `,
  },
  'definir-sltp': {
    title: 'Como definir SL/TP nas posições',
    content: `
      <h2>Como definir SL/TP nas posições</h2>
      <p>Você pode definir Stop Loss (SL) e Take Profit (TP) em posições abertas ou ao criar novos parâmetros.</p>
      <h3>Definir em posição existente:</h3>
      <ol>
        <li>Acesse o menu "Posições"</li>
        <li>Encontre a posição que deseja configurar</li>
        <li>Clique no botão "Atualizar SL/TP" ou "Editar"</li>
        <li>Preencha os valores:
          <ul>
            <li><strong>Stop Loss:</strong> Preço mínimo que você aceita vender (limite de perda)</li>
            <li><strong>Take Profit:</strong> Preço alvo para vender com lucro</li>
          </ul>
        </li>
        <li>Clique em "Salvar"</li>
        <li>A posição será automaticamente monitorada pelo sistema</li>
      </ol>
      <h3>Definir ao criar parâmetro:</h3>
      <ol>
        <li>Ao criar um novo parâmetro, na etapa "SL/TP"</li>
        <li>Configure:
          <ul>
            <li><strong>Stop Loss:</strong> Percentual ou valor fixo abaixo do preço de entrada</li>
            <li><strong>Take Profit:</strong> Percentual ou valor fixo acima do preço de entrada</li>
            <li><strong>Tipo:</strong> Percentual ou valor fixo</li>
          </ul>
        </li>
        <li>Todas as posições criadas com esse parâmetro terão SL/TP automático</li>
      </ol>
      <h3>Tipos de SL/TP:</h3>
      <ul>
        <li><strong>Percentual:</strong> Baseado em % do preço de entrada (ex: -5% para SL, +10% para TP)</li>
        <li><strong>Valor Fixo:</strong> Valor absoluto em USDT (ex: SL em $50.000, TP em $55.000)</li>
      </ul>
      <p><strong>Exemplo prático:</strong></p>
      <p>Se você comprou BTC a $50.000:</p>
      <ul>
        <li>SL de -5% = venderá automaticamente se o preço cair para $47.500</li>
        <li>TP de +10% = venderá automaticamente se o preço subir para $55.000</li>
      </ul>
      <p><strong>Importante:</strong> O monitor SL/TP precisa estar ativo para que as vendas automáticas funcionem.</p>
    `,
  },
};

// Gerar rotas estáticas em build time para todos os manuais
export function generateStaticParams() {
  return [
    { slug: 'login' },
    { slug: 'ativar-2fa' },
    { slug: 'criar-parametros' },
    { slug: 'criar-api-binance' },
    { slug: 'adicionar-conta' },
    { slug: 'monitor-sltp' },
    { slug: 'definir-sltp' },
  ];
}

export default function ManualPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const manual = manuals[slug];

  // Esta página só deve ser servida na porta 6010 (site público)
  // Na porta 5010, o middleware redireciona para mvcash.com.br
  // Não fazer verificação no lado do cliente para evitar loops

  if (!manual) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Manual não encontrado</h1>
          <Link href="/help">
            <Button>Voltar para Ajuda</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <Link href="/help">
            <Button variant="ghost" className="mb-6">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para Ajuda
            </Button>
          </Link>

          {/* Manual Content */}
          <Card className="border-gray-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-6">
                <BookOpen className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-bold text-gray-900">{manual.title}</h1>
              </div>
              <div
                className="prose max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-primary prose-strong:text-gray-900 prose-ul:text-gray-700 prose-ol:text-gray-700 prose-li:text-gray-700"
                dangerouslySetInnerHTML={{ __html: manual.content }}
                style={{
                  lineHeight: '1.75',
                }}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

