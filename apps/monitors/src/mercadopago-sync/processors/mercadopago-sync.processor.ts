import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';

@Processor('mercadopago-sync')
export class MercadoPagoSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MercadoPagoSyncProcessor.name);
  private readonly isDebugMode: boolean;

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService
  ) {
    super();
    // Verificar variável de ambiente para modo debug
    this.isDebugMode = process.env.MERCADOPAGO_SYNC_DEBUG === 'true' || process.env.MERCADOPAGO_SYNC_DEBUG === '1';
  }

  private debugLog(message: string, ...optionalParams: any[]): void {
    if (this.isDebugMode) {
      this.logger.log(message, ...optionalParams);
    }
  }

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    this.logger.log('Iniciando sincronização de pagamentos do Mercado Pago...');

    try {
      // Buscar configuração ativa do Mercado Pago
      const config = await this.prisma.mercadoPagoConfig.findFirst({
        where: { is_active: true },
        orderBy: { created_at: 'desc' },
      });

      if (!config) {
        this.logger.warn('Configuração do Mercado Pago não encontrada ou inativa');
        return {
          success: false,
          message: 'Configuração do Mercado Pago não encontrada',
          synced: 0,
          updated: 0,
          errors: 0,
        };
      }

      // Descriptografar access token
      const accessToken = await this.encryptionService.decrypt(config.access_token_enc);
      const baseUrl = 'https://api.mercadopago.com';

      // Debug: verificar quantos pagamentos existem no total
      const totalPayments = await this.prisma.subscriptionPayment.count();
      const paymentsWithMpId = await this.prisma.subscriptionPayment.count({
        where: {
          mp_payment_id: {
            not: null,
          },
        },
      });
      const paymentsWithoutMpId = await this.prisma.subscriptionPayment.count({
        where: {
          mp_payment_id: null,
        },
      });
      
      this.debugLog(`Debug: Total de pagamentos no banco: ${totalPayments}, com mp_payment_id: ${paymentsWithMpId}, sem mp_payment_id: ${paymentsWithoutMpId}`);

      // ====================================================================================================
      // IMPORTAR TODAS AS TRANSAÇÕES DA API DO MERCADO PAGO (TODOS OS STATUS)
      // ====================================================================================================
      this.debugLog('Iniciando importação de TODAS as transações do Mercado Pago...');
      
      let importedCount = 0;
      let updatedFromApiCount = 0;
      let offset = 0;
      const limit = 100; // Limite máximo por página
      let hasMore = true;
      const importedPaymentIds = new Set<string>();

      while (hasMore) {
        try {
          // Buscar TODOS os pagamentos da API (últimos 2 anos para pegar todos)
          // A API do Mercado Pago requer um range de data
          const twoYearsAgo = new Date();
          twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
          const today = new Date();
          
          const dateFrom = twoYearsAgo.toISOString().split('T')[0];
          const dateTo = today.toISOString().split('T')[0];
          
          const searchUrl = `${baseUrl}/v1/payments/search?range=date_created&begin_date=${dateFrom}T00:00:00.000-00:00&end_date=${dateTo}T23:59:59.999-00:00&offset=${offset}&limit=${limit}`;
          
          this.debugLog(`Buscando pagamentos da API (offset: ${offset}, limit: ${limit}, período: ${dateFrom} a ${dateTo})...`);
          
          const searchResponse = await fetch(searchUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });

          if (!searchResponse.ok) {
            const error = await searchResponse.json();
            this.logger.error(`Erro ao buscar pagamentos da API:`, error);
            break;
          }

          const searchResult = await searchResponse.json() as {
            results?: Array<{
              id: string;
              status: string;
              transaction_amount: number;
              payment_method_id: string;
              preference_id?: string;
              external_reference?: string;
              date_created: string;
              date_approved?: string;
              status_detail?: string;
            }>;
            paging?: {
              total: number;
              limit: number;
              offset: number;
            };
          };

          if (!searchResult.results || searchResult.results.length === 0) {
            this.debugLog('Nenhum pagamento encontrado na API');
            hasMore = false;
            break;
          }

          this.debugLog(`Encontrados ${searchResult.results.length} pagamentos na API (offset: ${offset})`);

          // Processar cada pagamento encontrado
          for (const mpPayment of searchResult.results) {
            try {
              // Garantir que mpPayment.id seja sempre string (Prisma espera String)
              const mpPaymentIdStr = String(mpPayment.id);
              importedPaymentIds.add(mpPaymentIdStr);

              // Verificar se já existe no banco
              const existingPayment = await this.prisma.subscriptionPayment.findFirst({
                where: {
                  mp_payment_id: mpPaymentIdStr,
                },
                include: {
                  subscription: true,
                },
              });

              const paymentStatus = this.mapMpStatusToDbStatus(mpPayment.status);
              const paymentMethod = mpPayment.payment_method_id === 'pix' ? 'PIX' : 'CARD';

              if (existingPayment) {
                // Atualizar pagamento existente
                const needsUpdate = 
                  existingPayment.status !== paymentStatus ||
                  Number(existingPayment.amount) !== mpPayment.transaction_amount ||
                  existingPayment.payment_method !== paymentMethod;

                if (needsUpdate) {
                  await this.prisma.subscriptionPayment.update({
                    where: { id: existingPayment.id },
                    data: {
                      status: paymentStatus,
                      amount: mpPayment.transaction_amount,
                      payment_method: paymentMethod,
                    },
                  });
                  updatedFromApiCount++;
                  this.debugLog(`Pagamento ${mpPayment.id} atualizado no banco`);
                }
              } else {
                // Tentar associar com assinatura por preference_id ou external_reference
                let subscriptionId: number | null = null;

                if (mpPayment.preference_id) {
                  const subscription = await this.prisma.subscription.findFirst({
                    where: {
                      mp_preference_id: mpPayment.preference_id,
                    },
                  });
                  if (subscription) {
                    subscriptionId = subscription.id;
                  }
                }

                // Se não encontrou por preference_id, tentar por external_reference
                if (!subscriptionId && mpPayment.external_reference) {
                  // external_reference pode ter formato: plan-{planId}-user-{email}-{timestamp}
                  // ou podemos buscar por email no external_reference
                  const emailMatch = mpPayment.external_reference.match(/user-([^-\s]+)/);
                  if (emailMatch) {
                    const email = emailMatch[1];
                    const user = await this.prisma.user.findUnique({
                      where: { email },
                      include: {
                        subscriptions: {
                          where: {
                            status: {
                              in: ['PENDING_PAYMENT', 'ACTIVE'],
                            },
                          },
                          orderBy: {
                            created_at: 'desc',
                          },
                          take: 1,
                        },
                      },
                    });
                    if (user && user.subscriptions.length > 0) {
                      subscriptionId = user.subscriptions[0].id;
                    }
                  }
                }

                // Fallback: se não encontrou por preference_id ou external_reference,
                // buscar pagamento completo da API para obter payer.email e tentar vincular
                if (!subscriptionId) {
                  try {
                    this.debugLog(`Tentando fallback para pagamento ${mpPaymentIdStr}: buscando pagamento completo da API...`);
                    
                    const paymentDetailResponse = await fetch(`${baseUrl}/v1/payments/${mpPaymentIdStr}`, {
                      method: 'GET',
                      headers: {
                        'Authorization': `Bearer ${accessToken}`,
                      },
                    });

                    if (paymentDetailResponse.ok) {
                      const paymentDetail = await paymentDetailResponse.json() as {
                        id: string;
                        payer?: {
                          email?: string;
                        };
                        transaction_amount: number;
                        date_created: string;
                      };

                      const paymentAmount = paymentDetail.transaction_amount;
                      const paymentDate = new Date(paymentDetail.date_created);
                      const sevenDaysBefore = new Date(paymentDate);
                      sevenDaysBefore.setDate(sevenDaysBefore.getDate() - 7);
                      
                      // Fallback 1: tentar vincular usando payer.email
                      if (paymentDetail.payer?.email) {
                        const payerEmail = paymentDetail.payer.email;
                        this.debugLog(`Fallback 1: pagamento ${mpPaymentIdStr} tem payer.email: ${payerEmail}`);
                        
                        // Buscar usuário pelo email
                        const user = await this.prisma.user.findUnique({
                          where: { email: payerEmail },
                          include: {
                            subscriptions: {
                              where: {
                                status: 'PENDING_PAYMENT',
                                mp_payment_id: null, // Ainda não tem payment_id
                              },
                              include: {
                                plan: true,
                              },
                              orderBy: {
                                created_at: 'desc',
                              },
                            },
                          },
                        });

                        if (user && user.subscriptions.length > 0) {
                          // Filtrar assinaturas por valor (tolerância de R$ 0,01)
                          const matchingSubscriptions = user.subscriptions.filter(sub => {
                            const monthlyPrice = Number(sub.plan.price_monthly);
                            const quarterlyPrice = Number(sub.plan.price_quarterly);
                            const diffMonthly = Math.abs(paymentAmount - monthlyPrice);
                            const diffQuarterly = Math.abs(paymentAmount - quarterlyPrice);
                            return diffMonthly <= 0.01 || diffQuarterly <= 0.01;
                          });

                          if (matchingSubscriptions.length > 0) {
                            // Filtrar por data: assinatura criada até 7 dias antes do pagamento
                            const dateFilteredSubscriptions = matchingSubscriptions.filter(sub => {
                              const subDate = new Date(sub.created_at);
                              return subDate <= paymentDate && subDate >= sevenDaysBefore;
                            });

                            // Escolher a assinatura mais recente que corresponde aos critérios
                            const selectedSubscription = dateFilteredSubscriptions.length > 0
                              ? dateFilteredSubscriptions[0]
                              : matchingSubscriptions[0];

                            subscriptionId = selectedSubscription.id;
                            this.debugLog(`Fallback 1 (email): assinatura ${subscriptionId} encontrada para pagamento ${mpPaymentIdStr} via email ${payerEmail}`);
                            
                            if (matchingSubscriptions.length > 1) {
                              this.debugLog(`Fallback 1: múltiplas assinaturas correspondem (${matchingSubscriptions.length}), escolhendo a mais recente: ${subscriptionId}`);
                            }
                          } else {
                            this.debugLog(`Fallback 1: nenhuma assinatura pendente encontrada com valor correspondente (${paymentAmount}) para email ${payerEmail}`);
                          }
                        } else {
                          this.debugLog(`Fallback 1: usuário não encontrado ou sem assinaturas pendentes para email ${payerEmail}`);
                        }
                      } else {
                        this.debugLog(`Fallback 1: pagamento ${mpPaymentIdStr} não tem payer.email`);
                      }
                      
                      // Fallback 2: se não encontrou por email, buscar TODAS as assinaturas pendentes sem mp_payment_id
                      // que correspondam ao valor e data (último recurso)
                      if (!subscriptionId) {
                        this.debugLog(`Tentando fallback 2 para pagamento ${mpPaymentIdStr}: buscando TODAS as assinaturas pendentes sem mp_payment_id que correspondam ao valor ${paymentAmount}...`);
                        
                        const allPendingSubscriptions = await this.prisma.subscription.findMany({
                          where: {
                            status: 'PENDING_PAYMENT',
                            mp_payment_id: null, // Ainda não tem payment_id
                            created_at: {
                              gte: sevenDaysBefore,
                              lte: paymentDate,
                            },
                          },
                          include: {
                            plan: true,
                            user: true,
                          },
                          orderBy: {
                            created_at: 'desc',
                          },
                          take: 20, // Limitar a 20 para não sobrecarregar
                        });
                        
                        // Filtrar por valor
                        const matchingByValue = allPendingSubscriptions.filter(sub => {
                          const monthlyPrice = Number(sub.plan.price_monthly);
                          const quarterlyPrice = Number(sub.plan.price_quarterly);
                          const diffMonthly = Math.abs(paymentAmount - monthlyPrice);
                          const diffQuarterly = Math.abs(paymentAmount - quarterlyPrice);
                          return diffMonthly <= 0.01 || diffQuarterly <= 0.01;
                        });
                        
                        if (matchingByValue.length > 0) {
                          // Escolher a mais recente
                          subscriptionId = matchingByValue[0].id;
                          this.debugLog(`Fallback 2 (valor+data): assinatura ${subscriptionId} encontrada para pagamento ${mpPaymentIdStr} (valor: ${paymentAmount}, email pagamento: ${paymentDetail.payer?.email || 'N/A'}, email cadastro: ${matchingByValue[0].user.email})`);
                          
                          if (matchingByValue.length > 1) {
                            this.debugLog(`Fallback 2: ATENÇÃO - múltiplas assinaturas correspondem (${matchingByValue.length}), escolhendo a mais recente: ${subscriptionId}. Verifique se está correto!`);
                          }
                          
                          // Se o email do pagamento for diferente do email do cadastro, alertar
                          if (paymentDetail.payer?.email && paymentDetail.payer.email !== matchingByValue[0].user.email) {
                            this.debugLog(`⚠️ ATENÇÃO: Email do pagamento (${paymentDetail.payer.email}) é diferente do email do cadastro (${matchingByValue[0].user.email}). Verifique se a vinculação está correta!`);
                          }
                        } else {
                          this.debugLog(`Fallback 2: nenhuma assinatura pendente encontrada com valor correspondente (${paymentAmount}) no período de 7 dias`);
                        }
                      }
                    } else {
                      const error = await paymentDetailResponse.json();
                      this.logger.warn(`Fallback: erro ao buscar pagamento completo ${mpPaymentIdStr}:`, error);
                    }
                  } catch (error: any) {
                    this.logger.error(`Fallback: erro ao tentar vincular pagamento ${mpPaymentIdStr} via email:`, error);
                  }
                }

                // Criar registro de pagamento apenas se tiver subscription_id (campo obrigatório)
                if (subscriptionId) {
                  await this.prisma.subscriptionPayment.create({
                    data: {
                      subscription_id: subscriptionId,
                      mp_payment_id: mpPaymentIdStr,
                      amount: mpPayment.transaction_amount,
                      status: paymentStatus,
                      payment_method: paymentMethod,
                    },
                  });

                  importedCount++;
                  this.debugLog(`Pagamento ${mpPaymentIdStr} importado (status: ${mpPayment.status}, método: ${paymentMethod})`);

                  // Se pagamento foi aprovado e tem assinatura, processar
                  if (mpPayment.status === 'approved') {
                    const subscription = await this.prisma.subscription.findUnique({
                      where: { id: subscriptionId },
                      include: {
                        plan: true,
                        user: true,
                      },
                    });

                    if (subscription && subscription.status === 'PENDING_PAYMENT') {
                      this.debugLog(`Processando pagamento aprovado para assinatura ${subscriptionId}`);
                      await this.processApprovedPayment(
                        subscriptionId,
                        mpPaymentIdStr,
                        {
                          id: mpPaymentIdStr,
                          status: mpPayment.status,
                          transaction_amount: mpPayment.transaction_amount,
                          payment_method_id: mpPayment.payment_method_id,
                          preference_id: mpPayment.preference_id,
                        }
                      );
                    }
                  }
                } else {
                  this.debugLog(`Pagamento ${mpPaymentIdStr} não pôde ser importado: nenhuma assinatura encontrada (preference_id: ${mpPayment.preference_id}, external_reference: ${mpPayment.external_reference})`);
                }
              }
            } catch (error: any) {
              this.logger.error(`Erro ao processar pagamento ${mpPayment.id}:`, error);
            }
          }

          // Verificar se há mais páginas
          if (searchResult.results.length < limit) {
            hasMore = false;
          } else {
            offset += limit;
            // Limitar a 1000 pagamentos por execução para não sobrecarregar
            if (offset >= 1000) {
              this.debugLog('Limite de 1000 pagamentos atingido nesta execução');
              hasMore = false;
            }
          }

          // Pequeno delay para não sobrecarregar a API
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error: any) {
          this.logger.error(`Erro ao buscar pagamentos da API (offset: ${offset}):`, error);
          hasMore = false;
        }
      }

      this.debugLog(`Importação concluída: ${importedCount} novos pagamentos importados, ${updatedFromApiCount} atualizados`);

      // Buscar TODOS os pagamentos SEM FILTRO NENHUM (como solicitado pelo usuário)
      // Primeiro, buscar todos os pagamentos que têm mp_payment_id
      let allPayments = await this.prisma.subscriptionPayment.findMany({
        where: {
          mp_payment_id: {
            not: null,
          },
        },
        include: {
          subscription: {
            include: {
              user: true,
              plan: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc', // Buscar os mais recentes primeiro
        },
      });

      this.debugLog(`Encontrados ${allPayments.length} pagamentos com mp_payment_id para sincronizar`);

      // Se não encontrou nenhum com mp_payment_id, buscar TODOS os pagamentos (mesmo sem mp_payment_id)
      // para verificar se há pagamentos que precisam ser vinculados
      if (allPayments.length === 0) {
        this.debugLog('Nenhum pagamento com mp_payment_id encontrado. Buscando TODOS os pagamentos...');
        
        const allPaymentsNoFilter = await this.prisma.subscriptionPayment.findMany({
          include: {
            subscription: {
              include: {
                user: true,
                plan: true,
              },
            },
          },
          orderBy: {
            created_at: 'desc',
          },
          take: 200, // Limitar a 200 para não sobrecarregar
        });
        
        if (allPaymentsNoFilter.length > 0) {
          this.debugLog(`Encontrados ${allPaymentsNoFilter.length} pagamentos (sem filtro de mp_payment_id)`);
          allPayments = allPaymentsNoFilter;
        }
      }

      // Usar allPayments como pendingPayments para manter compatibilidade com o código abaixo
      const pendingPayments = allPayments;

      let synced = 0;
      let updated = 0;
      let errors = 0;
      const errorDetails: Array<{ paymentId: number; error: string }> = [];

      for (const payment of pendingPayments) {
        try {
          if (!payment.mp_payment_id) {
            this.debugLog(`Pagamento ${payment.id} não tem mp_payment_id, pulando...`);
            continue;
          }

          this.debugLog(`Verificando pagamento ${payment.id} (MP: ${payment.mp_payment_id})`);
          
          // Buscar status atualizado do Mercado Pago
          const response = await fetch(`${baseUrl}/v1/payments/${payment.mp_payment_id}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });

          if (!response.ok) {
            const error = await response.json();
            this.logger.warn(`Erro ao buscar pagamento ${payment.mp_payment_id}:`, error);
            errors++;
            errorDetails.push({
              paymentId: payment.id,
              error: (error && typeof error === 'object' && 'message' in error)
                ? String(error.message)
                : 'Erro desconhecido',
            });
            continue;
          }

          const mpPayment = await response.json() as {
            id: string;
            status: string;
            transaction_amount: number;
            payment_method_id: string;
            preference_id?: string;
            status_detail?: string;
          };
          synced++;
          
          this.debugLog(`Pagamento ${payment.id} (MP: ${payment.mp_payment_id}) - Status: ${mpPayment.status}, Status Detail: ${mpPayment.status_detail || 'N/A'}`);

          this.debugLog(`Pagamento ${payment.id} (MP: ${payment.mp_payment_id}) - Status no MP: ${mpPayment.status}, Status no DB: ${payment.status}`);

          // Verificar se o status mudou
          const newStatus = this.mapMpStatusToDbStatus(mpPayment.status);
          
          // Sempre atualizar informações do pagamento (pode ter mudado valor, método, etc.)
          const updateData: any = {
            status: newStatus,
            amount: mpPayment.transaction_amount,
            payment_method: mpPayment.payment_method_id === 'pix' ? 'PIX' : 'CARD',
          };

          // Verificar se houve mudança de status ou se precisa atualizar
          const statusChanged = newStatus !== payment.status;
          const needsUpdate = statusChanged || 
                             Number(payment.amount) !== mpPayment.transaction_amount ||
                             payment.payment_method !== (mpPayment.payment_method_id === 'pix' ? 'PIX' : 'CARD');
          
          if (needsUpdate) {
            // Atualizar status e outras informações do pagamento
            await this.prisma.subscriptionPayment.update({
              where: { id: payment.id },
              data: updateData,
            });

            if (statusChanged) {
              // Log de mudança de status sempre visível (importante)
              this.logger.log(
                `Pagamento ${payment.id} (MP: ${payment.mp_payment_id}) atualizado: ${payment.status} -> ${newStatus}`
              );
            } else {
              this.debugLog(
                `Pagamento ${payment.id} (MP: ${payment.mp_payment_id}) atualizado (sem mudança de status)`
              );
            }

            // Se pagamento foi aprovado, processar assinatura
            if (newStatus === 'APPROVED' && payment.subscription && payment.mp_payment_id) {
              // Só processar se a assinatura ainda estiver pendente
              if (payment.subscription.status === 'PENDING_PAYMENT') {
                this.debugLog(`Processando pagamento aprovado para assinatura ${payment.subscription.id}`);
                await this.processApprovedPayment(payment.subscription.id, payment.mp_payment_id, mpPayment);
              } else {
                this.debugLog(`Assinatura ${payment.subscription.id} já foi processada (status: ${payment.subscription.status})`);
              }
            }

            // Se pagamento foi estornado ou reembolsado, desativar assinatura se estiver ativa
            if ((newStatus === 'REFUNDED' || newStatus === 'CANCELLED') && payment.subscription) {
              if (payment.subscription.status === 'ACTIVE') {
                this.logger.log(`Pagamento ${payment.id} foi ${newStatus.toLowerCase()}, desativando assinatura ${payment.subscription.id}`);
                await this.prisma.subscription.update({
                  where: { id: payment.subscription.id },
                  data: {
                    status: 'CANCELLED',
                    end_date: new Date(), // Finalizar imediatamente
                  },
                });
                
                // Remover role de subscriber do usuário
                await this.prisma.userRole.deleteMany({
                  where: {
                    user_id: payment.subscription.user_id,
                    role: 'subscriber',
                  },
                });
                
                this.logger.log(`Assinatura ${payment.subscription.id} cancelada devido a ${newStatus.toLowerCase()} do pagamento`);
              }
            }

            updated++;
          } else {
            // Mesmo que o status não tenha mudado, atualizar outras informações que podem ter mudado
            const paymentAmount = payment.amount.toNumber ? payment.amount.toNumber() : Number(payment.amount);
            const needsUpdate = 
              paymentAmount !== mpPayment.transaction_amount ||
              payment.payment_method !== (mpPayment.payment_method_id === 'pix' ? 'PIX' : 'CARD');

            if (needsUpdate) {
              await this.prisma.subscriptionPayment.update({
                where: { id: payment.id },
                data: updateData,
              });
              this.debugLog(`Pagamento ${payment.id} (MP: ${payment.mp_payment_id}) - Informações atualizadas (status mantido: ${payment.status})`);
              updated++;
            } else {
              this.debugLog(`Pagamento ${payment.id} (MP: ${payment.mp_payment_id}) - Sem alterações (status: ${payment.status})`);
            }
          }
        } catch (error: any) {
          errors++;
          const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
          errorDetails.push({
            paymentId: payment.id,
            error: errorMessage,
          });
          this.logger.error(`Erro ao processar pagamento ${payment.id}:`, error);
        }
      }

      // Também verificar assinaturas que podem ter pagamentos aprovados
      // Buscar TODAS as assinaturas SEM FILTRO (como solicitado)

      // Debug: verificar quantas assinaturas existem
      const totalSubscriptions = await this.prisma.subscription.count();
      const subscriptionsWithMpId = await this.prisma.subscription.count({
        where: {
          mp_payment_id: {
            not: null,
          },
        },
      });
      const pendingSubscriptionsCount = await this.prisma.subscription.count({
        where: {
          status: 'PENDING_PAYMENT',
        },
      });
      
      this.debugLog(`Debug: Total de assinaturas: ${totalSubscriptions}, com mp_payment_id: ${subscriptionsWithMpId}, pendentes: ${pendingSubscriptionsCount}`);

      // Buscar TODAS as assinaturas com mp_payment_id (sem filtro de status ou data)
      let pendingSubscriptions = await this.prisma.subscription.findMany({
        where: {
          mp_payment_id: {
            not: null,
          },
        },
        include: {
          plan: true,
          user: true,
        },
        orderBy: {
          created_at: 'desc',
        },
        take: 200, // Limitar a 200 para não sobrecarregar
      });

      this.debugLog(`Verificando ${pendingSubscriptions.length} assinaturas com mp_payment_id`);

      // Se não encontrou nenhuma com mp_payment_id, buscar TODAS as assinaturas (mesmo sem mp_payment_id)
      if (pendingSubscriptions.length === 0) {
        this.debugLog('Nenhuma assinatura com mp_payment_id encontrada. Buscando TODAS as assinaturas...');
        
        pendingSubscriptions = await this.prisma.subscription.findMany({
          include: {
            plan: true,
            user: true,
          },
          orderBy: {
            created_at: 'desc',
          },
          take: 200,
        });

        if (pendingSubscriptions.length > 0) {
          this.debugLog(`Encontradas ${pendingSubscriptions.length} assinaturas (sem filtro de mp_payment_id)`);
        }
      }

      // Buscar também assinaturas que têm mp_preference_id mas não têm mp_payment_id
      // Essas assinaturas podem ter pagamentos associados que precisam ser sincronizados
      // IMPORTANTE: Buscar TODAS as assinaturas pendentes com preference_id, não apenas as mais recentes
      const subscriptionsWithPreference = await this.prisma.subscription.findMany({
        where: {
          mp_preference_id: {
            not: null,
          },
          mp_payment_id: null, // Não tem payment_id ainda
          status: 'PENDING_PAYMENT', // Apenas pendentes
        },
        include: {
          plan: true,
          user: true,
        },
        // Remover limite para buscar todas as assinaturas pendentes
        orderBy: {
          created_at: 'desc',
        },
      });

      if (subscriptionsWithPreference.length > 0) {
        this.debugLog(`Encontradas ${subscriptionsWithPreference.length} assinaturas com preference_id mas sem payment_id`);
        // Adicionar à lista de assinaturas para verificar
        const existingIds = new Set(pendingSubscriptions.map(s => s.id));
        for (const sub of subscriptionsWithPreference) {
          if (!existingIds.has(sub.id)) {
            pendingSubscriptions.push(sub);
          }
        }
      }

      // Buscar também assinaturas que têm mp_payment_id mas não têm registro de pagamento correspondente
      if (pendingSubscriptions.length > 0) {
        this.debugLog('Verificando assinaturas com mp_payment_id mas sem registro de pagamento...');
        
        const subscriptionsWithoutPayment = [];
        for (const sub of pendingSubscriptions) {
          if (!sub.mp_payment_id) continue;
          
          const existingPayment = await this.prisma.subscriptionPayment.findFirst({
            where: {
              mp_payment_id: sub.mp_payment_id,
            },
          });

          if (!existingPayment) {
            this.debugLog(`Assinatura ${sub.id} tem mp_payment_id (${sub.mp_payment_id}) mas não tem registro de pagamento. Adicionando à lista de verificação.`);
            subscriptionsWithoutPayment.push(sub);
          }
        }

        if (subscriptionsWithoutPayment.length > 0) {
          this.debugLog(`Encontradas ${subscriptionsWithoutPayment.length} assinaturas com mp_payment_id mas sem registro de pagamento`);
          // Adicionar à lista de assinaturas para verificar (evitar duplicatas)
          const existingIds = new Set(pendingSubscriptions.map(s => s.id));
          for (const sub of subscriptionsWithoutPayment) {
            if (!existingIds.has(sub.id)) {
              pendingSubscriptions.push(sub);
            }
          }
        }
      }

      for (const subscription of pendingSubscriptions) {
        // Se tem preference_id mas não tem payment_id, buscar pagamentos por preference_id
        if (subscription.mp_preference_id && !subscription.mp_payment_id) {
          this.debugLog(`Buscando pagamentos para assinatura ${subscription.id} usando preference_id: ${subscription.mp_preference_id}`);
          
          try {
            // Usar merchant_orders para buscar pagamentos por preference_id
            // O endpoint merchant_orders aceita preference_id como parâmetro
            const merchantOrdersResponse = await fetch(`${baseUrl}/merchant_orders/search?preference_id=${subscription.mp_preference_id}`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
              },
            });

            if (merchantOrdersResponse.ok) {
              const merchantOrdersResult = await merchantOrdersResponse.json() as {
                elements?: Array<{
                  id: number;
                  status: string;
                  preference_id: string;
                  payments?: Array<{
                    id: string;
                    status: string;
                    transaction_amount: number;
                    payment_method_id: string;
                    date_approved?: string;
                  }>;
                }>;
              };

              if (merchantOrdersResult.elements && merchantOrdersResult.elements.length > 0) {
                this.debugLog(`Encontrados ${merchantOrdersResult.elements.length} pedido(s) para preference_id ${subscription.mp_preference_id}`);
                
                // Processar cada pedido e seus pagamentos
                for (const order of merchantOrdersResult.elements) {
                  if (!order.payments || order.payments.length === 0) {
                    this.debugLog(`Pedido ${order.id} não tem pagamentos associados`);
                    continue;
                  }

                  this.debugLog(`Pedido ${order.id} tem ${order.payments.length} pagamento(s)`);
                  
                  // Processar cada pagamento do pedido
                  for (const paymentData of order.payments) {
                    // Garantir que paymentData.id seja sempre string
                    const mpPaymentIdStr = String(paymentData.id);
                    const mpPayment = {
                      id: mpPaymentIdStr,
                      status: paymentData.status,
                      transaction_amount: paymentData.transaction_amount,
                      payment_method_id: paymentData.payment_method_id,
                      preference_id: subscription.mp_preference_id,
                    };
                  // Verificar se já existe registro de pagamento
                  const existingPayment = await this.prisma.subscriptionPayment.findFirst({
                    where: {
                      mp_payment_id: mpPaymentIdStr,
                    },
                  });

                  if (!existingPayment) {
                    this.debugLog(`Criando registro de pagamento para assinatura ${subscription.id} (MP: ${mpPaymentIdStr})`);
                    const paymentStatus = this.mapMpStatusToDbStatus(mpPayment.status);
                    await this.prisma.subscriptionPayment.create({
                      data: {
                        subscription_id: subscription.id,
                        mp_payment_id: mpPaymentIdStr,
                        amount: mpPayment.transaction_amount,
                        status: paymentStatus,
                        payment_method: mpPayment.payment_method_id === 'pix' ? 'PIX' : 'CARD',
                      },
                    });
                    synced++;
                  }

                  // Atualizar mp_payment_id na assinatura se ainda não estiver setado
                  if (!subscription.mp_payment_id) {
                    await this.prisma.subscription.update({
                      where: { id: subscription.id },
                      data: { mp_payment_id: mpPaymentIdStr },
                    });
                    subscription.mp_payment_id = mpPaymentIdStr;
                  }

                  // Se pagamento foi aprovado, processar assinatura
                  // Verificar status atual da assinatura antes de processar (pode ter mudado)
                  const currentSubscription = await this.prisma.subscription.findUnique({
                    where: { id: subscription.id },
                  });
                  
                  if (mpPayment.status === 'approved' && currentSubscription && currentSubscription.status === 'PENDING_PAYMENT') {
                    this.logger.log(`✅ Pagamento aprovado encontrado! Processando assinatura ${subscription.id} com pagamento ${mpPaymentIdStr} (encontrado via preference_id)`);
                    await this.processApprovedPayment(
                      subscription.id, 
                      mpPaymentIdStr, 
                      {
                        id: mpPaymentIdStr,
                        status: mpPayment.status,
                        transaction_amount: mpPayment.transaction_amount,
                        payment_method_id: mpPayment.payment_method_id,
                        preference_id: mpPayment.preference_id,
                      }
                    );
                    updated++;
                    this.logger.log(`✅ Assinatura ${subscription.id} ativada com sucesso!`);
                  } else if (mpPayment.status === 'approved' && currentSubscription && currentSubscription.status !== 'PENDING_PAYMENT') {
                    this.debugLog(`Assinatura ${subscription.id} já está com status ${currentSubscription.status}, não precisa processar`);
                  } else {
                    this.debugLog(`Pagamento ${mpPaymentIdStr} ainda não está aprovado (status: ${mpPayment.status}), aguardando...`);
                  }
                }
                }
              } else {
                this.debugLog(`Nenhum pedido encontrado para preference_id ${subscription.mp_preference_id}`);
              }
            } else {
              const error = await merchantOrdersResponse.json();
              this.logger.warn(`Erro ao buscar merchant_orders por preference_id ${subscription.mp_preference_id}:`, error);
              
              // Fallback: tentar buscar pagamentos recentes e filtrar
              this.debugLog(`Tentando busca alternativa de pagamentos recentes...`);
              try {
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                const dateFrom = sevenDaysAgo.toISOString().split('T')[0];
                const dateTo = new Date().toISOString().split('T')[0];
                
                const searchResponse = await fetch(`${baseUrl}/v1/payments/search?range=date_created&begin_date=${dateFrom}T00:00:00.000-00:00&end_date=${dateTo}T23:59:59.999-00:00&limit=100`, {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                  },
                });

                if (searchResponse.ok) {
                  const searchResult = await searchResponse.json() as {
                    results?: Array<{
                      id: string;
                      status: string;
                      transaction_amount: number;
                      payment_method_id: string;
                      preference_id?: string;
                    }>;
                  };
                  
                  // Filtrar pagamentos pelo preference_id
                  if (searchResult.results) {
                    const filteredPayments = searchResult.results.filter(
                      payment => payment.preference_id === subscription.mp_preference_id
                    );
                    
                    if (filteredPayments.length > 0) {
                      this.debugLog(`Encontrados ${filteredPayments.length} pagamento(s) via busca alternativa`);
                      
                      for (const mpPayment of filteredPayments) {
                        // Garantir que mpPayment.id seja sempre string
                        const mpPaymentIdStr = String(mpPayment.id);
                        
                        // Verificar se já existe registro de pagamento
                        const existingPayment = await this.prisma.subscriptionPayment.findFirst({
                          where: {
                            mp_payment_id: mpPaymentIdStr,
                          },
                        });

                        if (!existingPayment) {
                          this.debugLog(`Criando registro de pagamento para assinatura ${subscription.id} (MP: ${mpPaymentIdStr})`);
                          const paymentStatus = this.mapMpStatusToDbStatus(mpPayment.status);
                          await this.prisma.subscriptionPayment.create({
                            data: {
                              subscription_id: subscription.id,
                              mp_payment_id: mpPaymentIdStr,
                              amount: mpPayment.transaction_amount,
                              status: paymentStatus,
                              payment_method: mpPayment.payment_method_id === 'pix' ? 'PIX' : 'CARD',
                            },
                          });
                          synced++;
                        }

                        // Atualizar mp_payment_id na assinatura se ainda não estiver setado
                        if (!subscription.mp_payment_id) {
                          await this.prisma.subscription.update({
                            where: { id: subscription.id },
                            data: { mp_payment_id: mpPaymentIdStr },
                          });
                          subscription.mp_payment_id = mpPaymentIdStr;
                        }

                        // Se pagamento foi aprovado, processar assinatura
                        const currentSubscription = await this.prisma.subscription.findUnique({
                          where: { id: subscription.id },
                        });
                        
                        if (mpPayment.status === 'approved' && currentSubscription && currentSubscription.status === 'PENDING_PAYMENT') {
                          this.logger.log(`✅ Pagamento aprovado encontrado! Processando assinatura ${subscription.id} com pagamento ${mpPaymentIdStr} (encontrado via busca alternativa)`);
                          await this.processApprovedPayment(
                            subscription.id, 
                            mpPaymentIdStr, 
                            {
                              id: mpPaymentIdStr,
                              status: mpPayment.status,
                              transaction_amount: mpPayment.transaction_amount,
                              payment_method_id: mpPayment.payment_method_id,
                              preference_id: mpPayment.preference_id,
                            }
                          );
                          updated++;
                          this.logger.log(`✅ Assinatura ${subscription.id} ativada com sucesso!`);
                        }
                      }
                    } else {
                      this.debugLog(`Nenhum pagamento encontrado para preference_id ${subscription.mp_preference_id} na busca alternativa`);
                    }
                  }
                }
              } catch (fallbackError: any) {
                this.logger.error(`Erro na busca alternativa: ${fallbackError.message}`);
              }
            }
          } catch (error: any) {
            this.logger.error(`Erro ao buscar pagamentos por preference_id para assinatura ${subscription.id}:`, error);
          }
          continue; // Pular para próxima assinatura
        }

        // Se não tem payment_id, pular
        if (!subscription.mp_payment_id) {
          this.debugLog(`Assinatura ${subscription.id} não tem mp_payment_id nem preference_id, pulando...`);
          continue;
        }

        try {
          // Garantir que mp_payment_id seja string
          const mpPaymentIdStr = String(subscription.mp_payment_id);
          this.debugLog(`Verificando assinatura ${subscription.id} com pagamento MP: ${mpPaymentIdStr}`);
          
          const response = await fetch(`${baseUrl}/v1/payments/${mpPaymentIdStr}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });

          if (response.ok) {
            const mpPayment = await response.json() as {
              id: string;
              status: string;
              transaction_amount: number;
              payment_method_id: string;
              preference_id?: string;
            };
            
            this.debugLog(`Assinatura ${subscription.id} - Status no MP: ${mpPayment.status}, Status no DB: ${subscription.status}`);
            
            // Verificar se existe registro de pagamento, se não, criar
            const existingPayment = await this.prisma.subscriptionPayment.findFirst({
              where: {
                mp_payment_id: mpPaymentIdStr,
              },
            });

            if (!existingPayment) {
              this.debugLog(`Criando registro de pagamento para assinatura ${subscription.id} (MP: ${mpPaymentIdStr})`);
              const paymentStatus = this.mapMpStatusToDbStatus(mpPayment.status);
              await this.prisma.subscriptionPayment.create({
                data: {
                  subscription_id: subscription.id,
                  mp_payment_id: mpPaymentIdStr,
                  amount: mpPayment.transaction_amount,
                  status: paymentStatus,
                  payment_method: mpPayment.payment_method_id === 'pix' ? 'PIX' : 'CARD',
                },
              });
              synced++;
            } else {
              // Atualizar status do pagamento se mudou
              const paymentStatus = this.mapMpStatusToDbStatus(mpPayment.status);
              if (existingPayment.status !== paymentStatus) {
                this.debugLog(`Atualizando status do pagamento ${existingPayment.id}: ${existingPayment.status} -> ${paymentStatus}`);
                await this.prisma.subscriptionPayment.update({
                  where: { id: existingPayment.id },
                  data: { status: paymentStatus },
                });
                synced++;
              }
            }
            
            if (mpPayment.status === 'approved' && subscription.status === 'PENDING_PAYMENT') {
              this.logger.log(`Processando assinatura ${subscription.id} com pagamento aprovado`);
              await this.processApprovedPayment(subscription.id, mpPaymentIdStr, mpPayment);
              updated++;
            } else if (mpPayment.status !== 'approved') {
              this.debugLog(`Assinatura ${subscription.id} - Pagamento ainda não aprovado (status: ${mpPayment.status})`);
            }
          } else {
            const error = await response.json();
            this.logger.warn(`Erro ao buscar pagamento ${subscription.mp_payment_id} para assinatura ${subscription.id}:`, error);
          }
        } catch (error: any) {
          this.logger.error(`Erro ao verificar assinatura ${subscription.id}:`, error);
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Sincronização concluída: ${importedCount} importados da API, ${updatedFromApiCount} atualizados da API, ${synced} verificados, ${updated} atualizados, ${errors} erros (${duration}ms)`
      );

      return {
        success: true,
        message: 'Sincronização concluída',
        imported_from_api: importedCount,
        updated_from_api: updatedFromApiCount,
        synced,
        updated,
        errors,
        error_details: errorDetails.length > 0 ? errorDetails : undefined,
        duration_ms: duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error('Erro na sincronização de pagamentos:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
        synced: 0,
        updated: 0,
        errors: 1,
        duration_ms: duration,
      };
    }
  }

  private mapMpStatusToDbStatus(mpStatus: string): string {
    const statusMap: Record<string, string> = {
      pending: 'PENDING',
      approved: 'APPROVED',
      authorized: 'APPROVED',
      in_process: 'PENDING',
      in_mediation: 'PENDING',
      rejected: 'REJECTED',
      cancelled: 'CANCELLED',
      refunded: 'REFUNDED',
      charged_back: 'REJECTED',
      // Status adicionais do Mercado Pago
      refunded_partially: 'REFUNDED',
      cancelled_by_user: 'CANCELLED',
      cancelled_by_admin: 'CANCELLED',
    };
    return statusMap[mpStatus.toLowerCase()] || 'PENDING';
  }

  private async processApprovedPayment(
    subscriptionId: number,
    mpPaymentId: string,
    mpPayment: {
      id: string;
      status: string;
      transaction_amount: number;
      payment_method_id: string;
      preference_id?: string;
    }
  ): Promise<void> {
    try {
      const subscription = await this.prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          plan: true,
          user: true,
        },
      });

      if (!subscription) {
        this.logger.warn(`Assinatura ${subscriptionId} não encontrada`);
        return;
      }

      if (subscription.status === 'ACTIVE') {
        // Já está ativa, não precisa processar novamente
        return;
      }

      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + subscription.plan.duration_days);

      // Atualizar assinatura
      await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: 'ACTIVE',
          start_date: startDate,
          end_date: endDate,
          mp_payment_id: mpPaymentId,
          payment_method: mpPayment.payment_method_id === 'pix' ? 'PIX' : 'CARD',
        },
      });

      // Verificar se pagamento já existe, se não, criar
      const existingPayment = await this.prisma.subscriptionPayment.findFirst({
        where: { mp_payment_id: mpPaymentId },
      });

      if (!existingPayment) {
        await this.prisma.subscriptionPayment.create({
          data: {
            subscription_id: subscriptionId,
            mp_payment_id: mpPaymentId,
            amount: mpPayment.transaction_amount,
            status: 'APPROVED',
            payment_method: mpPayment.payment_method_id === 'pix' ? 'PIX' : 'CARD',
          },
        });
      } else if (existingPayment.status !== 'APPROVED') {
        await this.prisma.subscriptionPayment.update({
          where: { id: existingPayment.id },
          data: { status: 'APPROVED' },
        });
      }

      // Ativar usuário e adicionar role de subscriber
      await this.prisma.user.update({
        where: { id: subscription.user_id },
        data: { is_active: true },
      });

      const hasSubscriberRole = await this.prisma.userRole.findFirst({
        where: {
          user_id: subscription.user_id,
          role: 'subscriber',
        },
      });

      if (!hasSubscriberRole) {
        await this.prisma.userRole.create({
          data: {
            user_id: subscription.user_id,
            role: 'subscriber',
          },
        });
      }

      this.debugLog(`Assinatura ${subscriptionId} ativada via sincronização`);
    } catch (error: any) {
      this.logger.error(`Erro ao processar pagamento aprovado para assinatura ${subscriptionId}:`, error);
      throw error;
    }
  }
}
