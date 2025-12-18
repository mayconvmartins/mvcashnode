import { apiClient } from '@/lib/api/client';

interface WebPushConfig {
  publicKey: string | null;
  enabled: boolean;
}

let swRegistration: ServiceWorkerRegistration | null = null;

/**
 * Verifica se o navegador suporta Web Push
 */
export function isWebPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Verifica o status da permissão de notificações
 */
export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}

/**
 * Solicita permissão para notificações
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied';
  }
  
  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Registra o Service Worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[WebPush] Service Worker não suportado');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    
    console.log('[WebPush] Service Worker registrado:', registration.scope);
    swRegistration = registration;
    
    return registration;
  } catch (error) {
    console.error('[WebPush] Erro ao registrar Service Worker:', error);
    return null;
  }
}

/**
 * Obtém a registration do Service Worker
 */
export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (swRegistration) return swRegistration;
  
  if (!('serviceWorker' in navigator)) return null;
  
  try {
    const registration = await navigator.serviceWorker.ready;
    swRegistration = registration;
    return registration;
  } catch {
    return null;
  }
}

/**
 * Obtém a configuração de Web Push do servidor
 */
export async function getWebPushConfig(): Promise<WebPushConfig> {
  try {
    const response = await apiClient.get('/notifications/webpush/vapid-public-key');
    return response.data;
  } catch {
    return { publicKey: null, enabled: false };
  }
}

/**
 * Converte a chave VAPID de base64 para Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Inscreve o usuário para receber notificações push
 */
export async function subscribeToWebPush(deviceName?: string): Promise<boolean> {
  try {
    // Verificar suporte
    if (!isWebPushSupported()) {
      console.warn('[WebPush] Navegador não suporta Web Push');
      return false;
    }

    // Verificar permissão
    let permission = getNotificationPermission();
    if (permission === 'denied') {
      console.warn('[WebPush] Permissão de notificações negada');
      return false;
    }
    
    if (permission === 'default') {
      permission = await requestNotificationPermission();
      if (permission !== 'granted') {
        console.warn('[WebPush] Usuário não concedeu permissão');
        return false;
      }
    }

    // Obter configuração do servidor
    const config = await getWebPushConfig();
    if (!config.enabled || !config.publicKey) {
      console.warn('[WebPush] Web Push não está habilitado no servidor');
      return false;
    }

    // Obter registration do Service Worker
    const registration = await getServiceWorkerRegistration();
    if (!registration) {
      console.warn('[WebPush] Service Worker não disponível');
      return false;
    }

    // Verificar se já existe uma subscription
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      console.log('[WebPush] Subscription existente encontrada');
      // Enviar para o servidor para garantir que está sincronizado
      await sendSubscriptionToServer(existingSubscription, deviceName);
      return true;
    }

    // Criar nova subscription
    const applicationServerKey = urlBase64ToUint8Array(config.publicKey);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as BufferSource,
    });

    console.log('[WebPush] Nova subscription criada');
    
    // Enviar para o servidor
    await sendSubscriptionToServer(subscription, deviceName);
    
    return true;
  } catch (error) {
    console.error('[WebPush] Erro ao inscrever:', error);
    return false;
  }
}

/**
 * Envia a subscription para o servidor
 */
async function sendSubscriptionToServer(
  subscription: PushSubscription,
  deviceName?: string
): Promise<void> {
  const keys = subscription.toJSON().keys;
  
  await apiClient.post('/notifications/webpush/subscribe', {
    subscription: {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: keys?.p256dh,
        auth: keys?.auth,
      },
    },
    deviceName,
  });
  
  console.log('[WebPush] Subscription enviada para o servidor');
}

/**
 * Remove a subscription do usuário
 */
export async function unsubscribeFromWebPush(): Promise<boolean> {
  try {
    const registration = await getServiceWorkerRegistration();
    if (!registration) return false;

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true; // Já não está inscrito

    // Remover do servidor
    await apiClient.delete('/notifications/webpush/unsubscribe', {
      data: { endpoint: subscription.endpoint },
    });

    // Cancelar subscription local
    await subscription.unsubscribe();
    
    console.log('[WebPush] Subscription removida');
    return true;
  } catch (error) {
    console.error('[WebPush] Erro ao cancelar subscription:', error);
    return false;
  }
}

/**
 * Verifica se o usuário está inscrito para notificações push
 */
export async function isSubscribedToWebPush(): Promise<boolean> {
  try {
    const registration = await getServiceWorkerRegistration();
    if (!registration) return false;

    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
}

/**
 * Envia uma notificação de teste
 */
export async function sendTestNotification(): Promise<boolean> {
  try {
    const response = await apiClient.post('/notifications/webpush/test');
    return response.data.success;
  } catch {
    return false;
  }
}

/**
 * Lista as subscriptions do usuário
 */
export async function listWebPushSubscriptions(): Promise<any[]> {
  try {
    const response = await apiClient.get('/notifications/webpush/subscriptions');
    return response.data;
  } catch {
    return [];
  }
}

